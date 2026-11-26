/* Pure schedule block style and override helpers; shared by Plotter UI and tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlotterModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const STYLE_KEYS = ['color', 'fontColor', 'title', 'description', 'notes'];

  function resolveBlockStyle(block, batchDefaults) {
    const overrides = block && block.overrides && typeof block.overrides === 'object' ? block.overrides : {};
    const style = {
      color: batchDefaults.color,
      fontColor: batchDefaults.fontColor,
      title: block.title || '',
      description: block.description || '',
      notes: block.notes || ''
    };
    STYLE_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) style[key] = overrides[key];
    });
    if (!String(style.title || '').trim()) style.title = block.title || 'Untitled block';
    return style;
  }

  function setOneBlockOverride(block, patch, batchDefaults) {
    const next = { ...block, overrides: { ...(block.overrides || {}) } };
    Object.entries(patch || {}).forEach(([key, value]) => {
      if (!STYLE_KEYS.includes(key)) return;
      const inherited = batchDefaults ? resolveBlockStyle({ ...block, overrides: {} }, batchDefaults)[key] : undefined;
      if ((key === 'title' && !String(value || '').trim()) || (batchDefaults && value === inherited)) delete next.overrides[key];
      else next.overrides[key] = value;
    });
    if (!Object.keys(next.overrides).length) delete next.overrides;
    return next;
  }

  function clearOneBlockOverride(block, field) {
    const overrides = { ...(block.overrides || {}) };
    if (field) delete overrides[field];
    else Object.keys(overrides).forEach(key => delete overrides[key]);
    const next = { ...block };
    if (Object.keys(overrides).length) next.overrides = overrides;
    else delete next.overrides;
    return next;
  }

  function applyBatch(blocks, batchDefaults, patch, options = {}) {
    const skipOverridden = options.skipOverridden !== false;
    const nextBlocks = blocks.map(block => {
      const overrides = { ...(block.overrides || {}) };
      Object.keys(patch || {}).forEach(key => {
        if (!STYLE_KEYS.includes(key)) return;
        if (!skipOverridden) delete overrides[key];
      });
      const next = { ...block };
      if (Object.keys(overrides).length) next.overrides = overrides;
      else delete next.overrides;
      return next;
    });
    return { blocks: nextBlocks, batchDefaults: { ...batchDefaults, ...patch } };
  }

  function setBlockOverride(blocks, id, patch, batchDefaults) {
    return blocks.map(block => block.id === id ? setOneBlockOverride(block, patch, batchDefaults) : block);
  }
  function clearBlockOverride(blocks, id, field) {
    return blocks.map(block => block.id === id ? clearOneBlockOverride(block, field) : block);
  }

  return { STYLE_KEYS, resolveBlockStyle, setBlockOverride, clearBlockOverride, applyBatch };
});
