import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resourcesApi } from '../utils/api';
import { EMOTION_COLOURS } from '../constants/emotionColours';

// Swipeable strip of up to 3 page images with dots. Fetches GET /resources/{id}/previews when
// shown; hides itself silently if there are none or the request is refused (locked / error).
// Plain core ScrollView paging (no extra dependency); the dots row mirrors automatically in RTL.
// Oct 31: every page is fitted (contain) into the SAME fixed box with explicit pixel sizes, so a landscape page or one with
// wide margins can no longer collapse to a small image, and the dots always show for 2+ pages.
const PAGE_HEIGHT = 340;

export const PagePreviewStrip: React.FC<{ resourceId: string; t: (k: string) => string }> = ({ resourceId, t }) => {
  const [images, setImages] = useState<string[] | null>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let live = true;
    setImages(null);
    setIndex(0);
    resourcesApi.getPreviews(resourceId)
      .then((r) => live && setImages((r.previews || []).map((p) => `data:image/jpeg;base64,${p.image}`)))
      .catch(() => live && setImages([]));
    return () => { live = false; };
  }, [resourceId]);

  if (images && images.length === 0) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const raw = Math.round(Math.abs(e.nativeEvent.contentOffset.x) / width);
    setIndex(Math.max(0, Math.min((images?.length || 1) - 1, raw)));
  };

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text style={styles.title}>{t('resource_preview') || 'Preview'}</Text>
      {images === null || !width ? (
        <View style={[styles.page, { width: width || '100%' }]}><ActivityIndicator color={EMOTION_COLOURS.blue} /></View>
      ) : (
        <>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            accessibilityLabel={(t('resource_preview_page') || 'Page {n} of {total}').replace('{n}', String(index + 1)).replace('{total}', String(images.length))}
          >
            {images.map((uri, i) => (
              <View key={i} style={[styles.page, { width }]}>
                <Image source={{ uri }} style={{ width: Math.max(0, width - 16), height: PAGE_HEIGHT - 16 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
          {images.length > 1 && (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  title: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 6 },
  page: { height: PAGE_HEIGHT, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5', borderRadius: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D0D0D0' },
  dotActive: { backgroundColor: EMOTION_COLOURS.blue },
});
