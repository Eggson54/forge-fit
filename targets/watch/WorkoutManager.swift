import Foundation
import HealthKit

/// Recording a workout on the wrist.
///
/// The whole design rests on one decision: **this app does not talk to the
/// phone.** It records into HealthKit, and ForgeFit on the phone reads
/// HealthKit already — so the sync layer that a watch app normally needs
/// (WatchConnectivity, a shared App Group, a message queue, reachability
/// handling, a reconciliation pass for sessions recorded out of range) does
/// not exist here at all.
///
/// That is not laziness. WatchConnectivity is the part of a watch app that
/// breaks: it is asynchronous, it fails silently when the phone is away, and
/// the failure surfaces as a missing workout hours later. HealthKit is the
/// system the athlete's other apps already agree on, it syncs itself, and it
/// works when the phone is at home on a charger.
///
/// The cost is that the phone sees the workout when HealthKit gets round to
/// syncing it rather than the instant it ends, and that live numbers are not
/// mirrored to the phone mid-session. Neither matters for what this does.
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
  enum Phase: Equatable {
    case idle
    case requesting
    case running
    case paused
    case ending
    /// Something the athlete needs to act on, in words rather than a code.
    case failed(String)
  }

  @Published private(set) var phase: Phase = .idle
  @Published private(set) var heartRate: Double = 0
  @Published private(set) var activeEnergyKcal: Double = 0
  @Published private(set) var distanceMeters: Double = 0
  @Published private(set) var elapsed: TimeInterval = 0

  /// What the athlete picked on the first screen.
  @Published var activity: HKWorkoutActivityType = .running

  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var timer: Timer?

  // MARK: - Permissions

  private var shareTypes: Set<HKSampleType> {
    [HKQuantityType.workoutType()]
  }

  private var readTypes: Set<HKObjectType> {
    var types: Set<HKObjectType> = [HKQuantityType.workoutType()]
    for identifier: HKQuantityTypeIdentifier in [
      .heartRate, .activeEnergyBurned, .distanceWalkingRunning, .distanceCycling,
    ] {
      if let type = HKQuantityType.quantityType(forIdentifier: identifier) {
        types.insert(type)
      }
    }
    return types
  }

  func requestAuthorization() async {
    guard HKHealthStore.isHealthDataAvailable() else {
      phase = .failed("This Watch cannot record health data.")
      return
    }
    do {
      try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    } catch {
      // A refusal is not an error worth shouting about — the athlete may
      // simply have declined, and they can change their mind in Settings.
      phase = .failed("Health access was not granted. ForgeFit needs it to record a workout.")
    }
  }

  // MARK: - Session

  func start() {
    guard phase == .idle || isFailed else { return }
    phase = .requesting

    let configuration = HKWorkoutConfiguration()
    configuration.activityType = activity
    configuration.locationType = .outdoor

    do {
      let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)

      session.delegate = self
      builder.delegate = self

      self.session = session
      self.builder = builder

      let startDate = Date()
      session.startActivity(with: startDate)
      builder.beginCollection(withStart: startDate) { [weak self] success, error in
        Task { @MainActor in
          guard let self else { return }
          if success {
            self.phase = .running
            self.startTicking()
          } else {
            self.phase = .failed(error?.localizedDescription ?? "Could not start recording.")
          }
        }
      }
    } catch {
      phase = .failed(error.localizedDescription)
    }
  }

  func pause() {
    guard phase == .running else { return }
    session?.pause()
  }

  func resume() {
    guard phase == .paused else { return }
    session?.resume()
  }

  func end() {
    guard phase == .running || phase == .paused else { return }
    phase = .ending
    session?.end()
  }

  /// Throw the session away without saving it.
  ///
  /// Separate from `end()` because a two-minute recording that was started by
  /// accident should not land in Health and then in the athlete's history,
  /// where deleting it is a chore in a different app.
  func discard() {
    session?.end()
    builder?.discardWorkout()
    reset()
  }

  private var isFailed: Bool {
    if case .failed = phase { return true }
    return false
  }

  private func reset() {
    stopTicking()
    session = nil
    builder = nil
    heartRate = 0
    activeEnergyKcal = 0
    distanceMeters = 0
    elapsed = 0
    phase = .idle
  }

  // MARK: - Elapsed time

  /// Driven by a timer rather than by sample arrival.
  ///
  /// `HKLiveWorkoutBuilder` only calls back when a sample lands, and heart
  /// rate arrives every five seconds or so. Reading elapsed time off that
  /// would make the clock on the athlete's wrist stutter in five-second jumps
  /// while they are looking straight at it.
  private func startTicking() {
    stopTicking()
    let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
      Task { @MainActor in
        guard let self, let builder = self.builder else { return }
        self.elapsed = builder.elapsedTime
      }
    }
    // .common so the clock keeps running while a scroll is in flight.
    RunLoop.main.add(timer, forMode: .common)
    self.timer = timer
  }

  private func stopTicking() {
    timer?.invalidate()
    timer = nil
  }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutManager: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    Task { @MainActor in
      switch toState {
      case .running:
        phase = .running
        startTicking()
      case .paused:
        phase = .paused
        stopTicking()
      case .ended:
        stopTicking()
        await finish(at: date)
      default:
        break
      }
    }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    Task { @MainActor in
      phase = .failed(error.localizedDescription)
      stopTicking()
    }
  }

  /// Close collection and write the workout to Health.
  private func finish(at date: Date) async {
    guard let builder else {
      reset()
      return
    }
    do {
      try await builder.endCollection(at: date)
      // The saved workout is what the phone eventually reads. Discarding it
      // here on a non-fatal error would lose the session entirely, so any
      // failure is reported rather than swallowed.
      _ = try await builder.finishWorkout()
      reset()
    } catch {
      phase = .failed("The workout was recorded but could not be saved: \(error.localizedDescription)")
    }
  }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  nonisolated func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    for type in collectedTypes {
      guard let quantityType = type as? HKQuantityType,
            let statistics = workoutBuilder.statistics(for: quantityType) else { continue }

      Task { @MainActor in
        apply(statistics, for: quantityType)
      }
    }
  }

  private func apply(_ statistics: HKStatistics, for type: HKQuantityType) {
    switch type.identifier {
    case HKQuantityTypeIdentifier.heartRate.rawValue:
      // Most recent, not the average: the number on a workout screen is
      // meant to answer "what is it doing right now".
      let unit = HKUnit.count().unitDivided(by: .minute())
      heartRate = statistics.mostRecentQuantity()?.doubleValue(for: unit) ?? heartRate

    case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
      activeEnergyKcal = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? activeEnergyKcal

    case HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue,
         HKQuantityTypeIdentifier.distanceCycling.rawValue:
      distanceMeters = statistics.sumQuantity()?.doubleValue(for: .meter()) ?? distanceMeters

    default:
      break
    }
  }
}
