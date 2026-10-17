
    const SET_CSS =
      '.dts-wrap{display:flex;flex-direction:column;gap:18px;padding:4px 0 24px;max-width:900px}' +
      '.dts-header{display:flex;flex-direction:column;gap:8px;padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l2)}' +
      '.dts-page{padding:0}' +
      '.dts-page-title{font-size:20px;font-weight:700;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:10px}' +
      '.dts-page-sub{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.5}' +
      '.dts-block{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:12px}' +
      '.dts-h{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between}' +
      '.dts-sub{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.4}' +
      '.dts-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}' +
      '.dts-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}' +
      '.dts-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
      '.dts-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
      '.dts-chev{margin-left:auto;color:var(--dsw-alias-label-secondary);flex:none;transition:transform .16s}' +
      '.dts-chevOpen{transform:rotate(180deg)}' +
      '.dts-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0}' +
      '.dts-field{display:flex;flex-direction:column;gap:6px;padding:6px 0;font-size:13px;color:var(--dsw-alias-label-primary)}' +
      '.dts-input{height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:13px;box-sizing:border-box}' +
      '.dts-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary, #6366f1)}' +
      '.dts-foot{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:14px 0 4px}' +
      '.dts-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:6px 16px;font-size:13px;font-weight:500;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);transition:all .15s ease}' +
      '.dts-save:hover:not(:disabled){opacity:0.88}' +
      '.dts-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 12px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease}' +
      '.dts-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2))}' +
      '.dts-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent)}' +
      '.dts-btn-danger:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 50%, transparent)}' +
      '.dts-entry{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}' +
      '.dts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.dts-row .dts-model{flex:1;min-width:120px}' +
      '.dts-row .dts-key{flex:1;min-width:180px}' +
      '.dts-mini{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;width:28px;height:28px;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:13px;transition:all .15s ease}' +
      '.dts-mini:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2))}' +
      '.dts-ok{font-size:12px;color:var(--dsw-alias-state-success-primary);font-weight:500}' +
      '.dts-bad{font-size:12px;color:var(--dsw-alias-state-error-primary);font-weight:500}' +
      '.dts-badge{font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap;display:inline-flex;align-items:center;gap:4px;font-weight:500}' +
      '.dts-badge-on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)}' +
      '.dts-badge-warn{color:var(--dsw-alias-state-warn-primary, #f59e0b);border-color:var(--dsw-alias-state-warn-primary, #f59e0b);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 8%, transparent)}' +
      '.dts-badge-bad{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}' +
      '.dts-link{background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:0;text-decoration:underline}' +
      '.dts-link:hover:not(:disabled){color:var(--dsw-alias-label-primary)}' +
      '.dts-alert{padding:10px 14px;border-radius:8px;font-size:13px}' +
      '.dts-alert-err{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 20%, transparent)}' +
      '.dts-alert-warn{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 10%, transparent);color:var(--dsw-alias-state-warn-primary, #f59e0b);border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 20%, transparent)}' +
      '.dts-alert-ok{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary);border:1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 20%, transparent)}' +
      // Per-message speak button: icon-only, same weight as the sibling actions.
      '.dts-act{box-sizing:border-box;width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));display:inline-flex;align-items:center;justify-content:center;padding:6px;cursor:pointer;border:none;border-radius:var(--dsw-radius-sm, 8px);background:none;color:var(--dsw-alias-label-tertiary, #999);transition:background .15s ease,color .15s ease}' +
      '.dts-act:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary, #666)}' +
      '.dts-act:active{background:color-mix(in srgb, var(--dsw-alias-label-secondary, #666) 16%, transparent)}' +
      '.dts-act[data-active]{color:var(--dsw-alias-brand-primary, #4d6bfe)}' +
      '.dts-act[data-active]:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 12%, transparent);color:var(--dsw-alias-brand-primary, #4d6bfe)}' +
      '.dts-act:focus-visible{outline:2px solid var(--dsw-alias-brand-primary, #4d6bfe);outline-offset:1px}' +
      '.dts-act svg{width:calc(17px + var(--dsh-content-font-delta,0px));height:calc(17px + var(--dsh-content-font-delta,0px));display:block}' +
      '@keyframes dts-act-pulse{0%,100%{opacity:.35}50%{opacity:1}}' +
      '.dts-act[data-busy] [data-wave]{animation:dts-act-pulse 1.1s ease-in-out infinite}' +
      '.dts-act[data-busy] [data-wave="2"]{animation-delay:.22s}' +
      // Right-click menu: just the recent lines, all of them, scrolled by wheel.
      '.dts-menu{position:fixed;z-index:2147483000;box-sizing:border-box;min-width:210px;max-width:300px;max-height:min(64vh, 460px);overflow:hidden;padding:6px;display:flex;flex-direction:column;gap:2px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2, #e8e8e8);background:var(--dsw-alias-bg-layer-2, #fff);box-shadow:0 12px 32px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.06);font-size:13px;line-height:1.4}' +
      '.dts-menu-item{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;padding:7px 10px;border:none;border-radius:8px;background:none;color:var(--dsw-alias-label-primary, #111);font:inherit;text-align:left;cursor:pointer}' +
      '.dts-menu-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))}' +
      '.dts-menu-item:disabled{opacity:.42;cursor:default}' +
      '.dts-menu-item span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      // The list is the whole menu: no cap on how many lines, it scrolls instead.
      '.dts-menu-list{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2, #ddd) transparent}' +
      '.dts-menu-list::-webkit-scrollbar{width:8px}' +
      '.dts-menu-list::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2, #ddd);border-radius:4px}' +
      '.dts-menu-list::-webkit-scrollbar-track{background:transparent}' +
      '.dts-menu-text{flex:none;width:100%;box-sizing:border-box;padding:6px 10px;border:none;border-radius:8px;background:none;color:var(--dsw-alias-label-primary, #111);font:inherit;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.dts-menu-text:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))}' +
      // Transport cluster: same row as the reply actions, parked after the clock.
      // DSH fades that row out (opacity:0) until you hover the message, so force
      // it back on while a clip is playing — otherwise the controls vanish.
      '[data-actions-reveal]:has(.dts-transport) [class*="actions"]{opacity:1 !important}' +
      '.dts-transport{display:inline-flex;align-items:center;gap:2px;margin-left:4px;order:999}' +
      '.dts-tbtn{box-sizing:border-box;width:27px;height:27px;display:inline-flex;align-items:center;justify-content:center;padding:4px;border:none;border-radius:7px;background:none;color:var(--dsw-alias-label-tertiary, #999);cursor:pointer;transition:background .15s ease,color .15s ease}' +
      '.dts-tbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));color:var(--dsw-alias-label-primary, #111)}' +
      '.dts-tbtn:disabled{opacity:.38;cursor:default}' +
      '.dts-tbtn svg{width:16px;height:16px;display:block}' +
      '.dts-grow{flex:1;min-width:100px}'

    const setCssId = 'dsh-tts/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-dsh-plugin="dsh-tts"]')) {
      const tag = document.createElement('style')
      tag.textContent = SET_CSS
      tag.setAttribute('data-dsh-plugin', 'dsh-tts')
      tag.dataset.pluginCss = setCssId
      document.head.appendChild(tag)
    }
