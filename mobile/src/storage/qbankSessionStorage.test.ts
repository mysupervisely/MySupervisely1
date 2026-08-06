import AsyncStorage from '@react-native-async-storage/async-storage';

import { qbankSessionStorage } from './qbankSessionStorage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('qbankSessionStorage — resume support', () => {
  test('defaults to 0 when nothing has been saved yet (first-ever launch)', async () => {
    expect(await qbankSessionStorage.getCurrentIndex()).toBe(0);
  });

  test('round-trips a saved index', async () => {
    await qbankSessionStorage.setCurrentIndex(47);
    expect(await qbankSessionStorage.getCurrentIndex()).toBe(47);
  });

  test('overwrites the previous value on repeated saves (simulating Next/Previous during a session)', async () => {
    await qbankSessionStorage.setCurrentIndex(10);
    await qbankSessionStorage.setCurrentIndex(11);
    await qbankSessionStorage.setCurrentIndex(12);
    expect(await qbankSessionStorage.getCurrentIndex()).toBe(12);
  });
});
