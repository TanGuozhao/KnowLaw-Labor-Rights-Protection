import { useEffect, useState } from "react";

function appendLink(href, bucket) {
  const existing = document.querySelector(`link[data-legacy-href="${href}"]`);
  if (existing) {
    bucket.push(existing);
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-legacy-href", href);
  document.head.appendChild(link);
  bucket.push(link);
}

function appendScript({ src, module = false }, bucket) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src.includes("?") ? src : `${src}?v=${Date.now()}`;
    if (module) s.type = "module";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`加载脚本失败: ${src}`));
    document.body.appendChild(s);
    bucket.push(s);
  });
}

function waitForElement(selector, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      window.setTimeout(check, 16);
    };
    check();
  });
}

function LegacyPageHost({ htmlPath, cssHrefs = [], scripts = [] }) {
  const [mainHtml, setMainHtml] = useState("<main class='page'><p>加载中...</p></main>");
  const cssKey = JSON.stringify(cssHrefs);
  const scriptKey = JSON.stringify(scripts);

  useEffect(() => {
    let cancelled = false;
    const addedLinks = [];
    const addedScripts = [];
    (async () => {
      try {
        const html = await fetch(htmlPath).then((r) => r.text());
        const doc = new DOMParser().parseFromString(html, "text/html");
        const main = doc.querySelector("main");
        const dialogs = Array.from(doc.querySelectorAll("dialog"))
          .map((node) => node.outerHTML)
          .join("");
        const mergedHtml = main
          ? `${main.outerHTML}${dialogs}`
          : "<main class='page'><p>页面结构缺失</p></main>";
        if (!cancelled) setMainHtml(mergedHtml);
        await waitForElement("#sharedNavbar");
        if (cancelled) return;
        cssHrefs.forEach((href) => appendLink(href, addedLinks));
        for (const s of scripts) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await appendScript(s, addedScripts);
          } catch (e) {
            console.error(e);
          }
        }
      } catch (e) {
        if (!cancelled) setMainHtml(`<main class="page"><p>加载失败：${String(e?.message || e)}</p></main>`);
      }
    })();
    return () => {
      cancelled = true;
      addedScripts.forEach((s) => s.remove());
      addedLinks.forEach((l) => l.remove());
    };
  }, [htmlPath, cssKey, scriptKey]);

  return (
    <>
      <div className="overlay"></div>
      <div dangerouslySetInnerHTML={{ __html: mainHtml }} />
    </>
  );
}

export default LegacyPageHost;
