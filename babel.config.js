module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo adds the worklets plugin itself from SDK 54 on, and
    // listing `react-native-reanimated/plugin` here as well would apply the
    // transform twice. It used to be required and last; now it is neither.
    presets: ['babel-preset-expo'],
  };
};
