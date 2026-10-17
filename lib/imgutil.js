'use strict';

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-cfsrc', 'data-img', 'data-thumb'];

function isPlaceholder(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (/^data:/i.test(v)) return v.length < 800;
  return /(^|\/)(blank|placeholder|lazy|loading|spacer|transparent)[^/]*\.(gif|png|svg|jpg)(\?|$)/i.test(v);
}

function absolutize(value, base) {
  let v = String(value || '').trim().replace(/&amp;/g, '&');
  if (!v) return '';
  if (v.startsWith('//')) return 'https:' + v;
  if (/^https?:\/\//i.test(v) || /^data:/i.test(v)) return v;
  if (!base) return v;
  try {
    return new URL(v, base).href;
  } catch (e) {
    return v;
  }
}

function firstSrcset(value) {
  const first = String(value || '').split(',')[0] || '';
  return first.trim().split(/\s+/)[0] || '';
}

// Ambil URL gambar asli dari elemen <img> cheerio (lewati placeholder lazy-load)
function pickImg($img, base) {
  if (!$img || !$img.length) return null;
  const candidates = [];
  LAZY_ATTRS.forEach((attr) => candidates.push($img.attr(attr)));
  candidates.push(firstSrcset($img.attr('data-srcset')));
  candidates.push(firstSrcset($img.attr('srcset')));
  candidates.push($img.attr('src'));
  for (const candidate of candidates) {
    if (candidate && !isPlaceholder(candidate)) return absolutize(candidate, base);
  }
  return null;
}

const IMAGE_KEYS = new Set(['image', 'img', 'poster', 'thumbnail', 'cover', 'thumb']);

// Rapikan semua field gambar di respons API (//cdn → https://cdn, buang placeholder)
function normalizeImages(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return node;
  if (Array.isArray(node)) {
    node.forEach((item) => normalizeImages(item, depth + 1));
    return node;
  }
  Object.keys(node).forEach((key) => {
    const value = node[key];
    if (typeof value === 'string' && IMAGE_KEYS.has(key)) {
      node[key] = isPlaceholder(value) ? '' : absolutize(value, null);
    } else if (value && typeof value === 'object') {
      normalizeImages(value, depth + 1);
    }
  });
  return node;
}

module.exports = { pickImg, isPlaceholder, absolutize, normalizeImages };
