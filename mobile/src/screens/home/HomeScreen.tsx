import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { PlaceholderNotice } from '../../components/PlaceholderNotice';
import { colors, radius, spacing, typeScale } from '../../theme';
import { BODY_MAP_ANATOMICAL_SYSTEM_KEYS } from '../../constants/bodyMap';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

/**
 * M1 stub. Renders the real body-map illustration (not a placeholder image)
 * statically, with no interactive hotspots yet — M3 builds the real,
 * coordinate-driven interactive map per docs/MOBILE_MIGRATION_AUDIT.md §F
 * and src/constants/bodyMap.ts. The button below exists only to prove the
 * Home -> System -> Lesson navigation path works end-to-end.
 */
export function HomeScreen({ navigation }: Props) {
  const previewSystemKey = BODY_MAP_ANATOMICAL_SYSTEM_KEYS[0];

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Home">Body Map</ScreenTitle>

      <View style={styles.imageWrap}>
        <Image
          source={require('../../../assets/brand/body_map_diagram.png')}
          style={styles.bodyImage}
          resizeMode="contain"
          accessibilityLabel="PharmDPrepped body map illustration"
        />
      </View>

      <PlaceholderNotice
        milestone="M3"
        description="Interactive hotspots for the 8 anatomical systems, scaled from the real 300x640 coordinate system (see src/constants/bodyMap.ts), plus a 'More Topics' list for the 18 non-anatomical systems."
      />

      <Pressable
        accessibilityRole="button"
        style={styles.link}
        onPress={() => navigation.navigate('System', { systemKey: previewSystemKey })}
      >
        <Text style={styles.linkText}>Preview: open a System screen →</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  bodyImage: {
    width: '100%',
    height: 340,
  },
  link: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  linkText: {
    ...typeScale.bodyMedium,
    color: colors.teal,
  },
});
