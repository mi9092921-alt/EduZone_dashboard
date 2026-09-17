import { describe, expect, it } from 'vitest';

import { formatVideoUrl, isValidVideoUrl, parseVideoUrl } from './video.utils';

describe('parseVideoUrl', () => {
  it('returns an empty YouTube path for an empty value', () => {
    expect(parseVideoUrl('')).toEqual({ provider: 'youtube', video_path: '' });
    expect(parseVideoUrl('   ')).toEqual({ provider: 'youtube', video_path: '' });
  });

  it('parses YouTube URLs and preserves an unrecognised YouTube path', () => {
    expect(parseVideoUrl(' https://www.youtube.com/watch?v=abcdefghijk ')).toEqual({
      provider: 'youtube',
      video_path: 'abcdefghijk',
    });
    expect(parseVideoUrl('https://youtu.be/abcdefghijk')).toEqual({
      provider: 'youtube',
      video_path: 'abcdefghijk',
    });
    expect(parseVideoUrl('https://youtube.com/watch?v=short')).toEqual({
      provider: 'youtube',
      video_path: 'https://youtube.com/watch?v=short',
    });
  });

  it('parses Vimeo URLs and falls back to the clean URL when the id is missing', () => {
    expect(parseVideoUrl('https://vimeo.com/123456')).toEqual({
      provider: 'vimeo',
      video_path: '123456',
    });
    expect(parseVideoUrl('https://vimeo.com/channel/123456')).toEqual({
      provider: 'vimeo',
      video_path: '123456',
    });
    expect(parseVideoUrl('https://vimeo.com/not-a-video')).toEqual({
      provider: 'vimeo',
      video_path: 'https://vimeo.com/not-a-video',
    });
  });

  it('parses Mux URLs, including the unmatched absolute-url cleanup path', () => {
    expect(parseVideoUrl('https://stream.mux.com/playback-id.m3u8')).toEqual({
      provider: 'mux',
      video_path: 'playback-id',
    });
    expect(parseVideoUrl('https://mux.com/asset')).toEqual({
      provider: 'mux',
      video_path: 'https://mux.com/asset',
    });
    expect(parseVideoUrl('https://stream.mux.com/')).toEqual({
      provider: 'mux',
      video_path: '',
    });
  });

  it('parses Bunny URLs and CDN hostnames', () => {
    expect(parseVideoUrl('https://video.bunnycdn.com/play/video-id')).toEqual({
      provider: 'bunny',
      video_path: 'video-id',
    });
    expect(parseVideoUrl('https://library.b-cdn.net/video-id')).toEqual({
      provider: 'bunny',
      video_path: 'video-id',
    });
    expect(parseVideoUrl('https://video.bunnycdn.com/play/')).toEqual({
      provider: 'bunny',
      video_path: '',
    });
  });

  it('parses S3 URLs and strips the protocol from absolute paths', () => {
    expect(parseVideoUrl('https://s3.amazonaws.com/bucket/video.mp4')).toEqual({
      provider: 's3',
      video_path: 's3.amazonaws.com/bucket/video.mp4',
    });
    expect(parseVideoUrl('s3.eu-west-1.amazonaws.com/bucket/video.mp4')).toEqual({
      provider: 's3',
      video_path: 's3.eu-west-1.amazonaws.com/bucket/video.mp4',
    });
  });

  it('handles clean YouTube ids and generic fallback paths', () => {
    expect(parseVideoUrl('abcdefghijk')).toEqual({
      provider: 'youtube',
      video_path: 'abcdefghijk',
    });
    expect(parseVideoUrl('https://cdn.example.com/video.mp4')).toEqual({
      provider: 'youtube',
      video_path: 'cdn.example.com/video.mp4',
    });
    expect(parseVideoUrl('http://cdn.example.com/video.mp4')).toEqual({
      provider: 'youtube',
      video_path: 'cdn.example.com/video.mp4',
    });
    expect(parseVideoUrl('local/video.mp4')).toEqual({
      provider: 'youtube',
      video_path: 'local/video.mp4',
    });
  });
});

describe('formatVideoUrl', () => {
  it('returns an empty path and preserves absolute URLs', () => {
    expect(formatVideoUrl('youtube', '')).toBe('');
    expect(formatVideoUrl('youtube', 'https://cdn.example.com/video.mp4')).toBe(
      'https://cdn.example.com/video.mp4',
    );
    expect(formatVideoUrl('youtube', 'http://cdn.example.com/video.mp4')).toBe(
      'http://cdn.example.com/video.mp4',
    );
  });

  it.each([
    ['youtube', 'abc', 'https://youtu.be/abc'],
    ['vimeo', '123', 'https://vimeo.com/123'],
    ['mux', 'abc', 'https://stream.mux.com/abc.m3u8'],
    ['bunny', 'abc', 'https://video.bunnycdn.com/play/abc'],
    ['s3', 'bucket/video.mp4', 'https://bucket/video.mp4'],
    ['unknown', 'relative/path', 'relative/path'],
  ])('formats a %s path', (provider, path, expected) => {
    expect(formatVideoUrl(provider, path)).toBe(expected);
  });
});

describe('isValidVideoUrl', () => {
  it('requires a non-empty parsed path', () => {
    expect(isValidVideoUrl('')).toBe(false);
    expect(isValidVideoUrl('   ')).toBe(false);
    expect(isValidVideoUrl('https://cdn.example.com/video.mp4')).toBe(true);
  });
});
