/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch',
  name: 'ForgeFitWatch',
  displayName: 'ForgeFit',

  // watchOS 10 is where the current SwiftUI navigation and the workout
  // APIs used here settled. Going lower means supporting a Series 4 with a
  // different layout system, which is not worth it for a first version.
  deploymentTarget: '10.0',

  frameworks: ['SwiftUI', 'HealthKit', 'WatchKit'],

  // The watch app records straight into HealthKit; the phone already reads
  // from there. That is the whole sync mechanism — see README.md.
  entitlements: {
    'com.apple.developer.healthkit': true,
    'com.apple.developer.healthkit.access': [],
  },
};
