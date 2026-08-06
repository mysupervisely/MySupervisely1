/* global jest */
// Official AsyncStorage jest mock — in-memory, reset between test files
// automatically by jest-expo's module registry. Required for any test that
// touches src/storage/* (attemptsStorage, qbankSessionStorage,
// onboardingStorage) without mocking each file individually.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
