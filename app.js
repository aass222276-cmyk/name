/* eslint-disable no-unused-vars */
/* 漫画ネーム用Webアプリ v14（問題1/4/5の最小修正を適用） */

(function () {
    'use strict';

    /* ---------------------------
       状態と要素の参照
    ----------------------------*/
    const state = {
        pages: [],
        currentPageIndex: 0,
        currentTool: null, // 'serif' | 'koma' | null
        defaultFontSize: 24,
        idCounter: 1,
        selectedBubbleId: null
    };

    const appEl = document.getElementById('app');
    const canvasContainer = document.getElementById('canvasContainer');
    const toolbar = document.getElementById('toolbar');
    const textIO = document.getElementById('textIO');
    const bubbleEditor = document.getElementById('bubbleEditor');
    const fontSizeRange = document.getElementById('fontSizeRange');
    const fontSizeValueDisplay = document.getElementById('fontSizeValue');

    const pageElements = []; // {wrapper, canvas, indexBadge}

    /* ---------------------------
       初期化
    ----------------------------*/
    function init() {
        // 初期ページを生成（既存データがあれば復元処理を差し込む）
        const page = createNewPage({ x: 20, y: 20, w: 680, h: Math.round(680 * 1.4142) });
        state.pages.push(page);
        addPageToDOM(page, 0);

        fontSizeRange.value = state.defaultFontSize;
        fontSizeValueDisplay.innerHTML = `${state.defaultFontSize}<br>px`;

        attachToolbarEvents();
        renderActivePage();
    }

    document.addEventListener('DOMContentLoaded', init);

    /* ---------------------------
       ページ＆描画ヘルパ
    ----------------------------*/
    function createNewPage(frame) {
        return {
            frame,
            panels: [], // {x,y,w,h}
            bubbles: [] // {id,text,x,y,w,h,font}
        };
    }

    function addPageToDOM(page, index) {
        const wrap = document.createElement('div');
        wrap.className = 'page-wrapper';

        const badge = document.createElement('div');
        badge.className = 'page-index';
        badge.textContent = `Page ${index + 1}`;
        wrap.appendChild(badge);

        const canvas = document.createElement('canvas');
        canvas.className = 'page';
        canvas.dataset.pageIndex = index;
        wrap.appendChild(canvas);

        canvasContainer.appendChild(wrap);

        pageElements[index] = { wrapper: wrap, canvas, indexBadge: badge };
        resizeCanvasToFrame(canvas, page.frame);

        attachCanvasEvents(canvas);
    }

    function resizeCanvasToFrame(canvas, frame) {
        canvas.width = Math.max(200, frame.w + frame.x * 2);
        canvas.height = Math.max(200, frame.h + frame.y * 2);
    }

    function renderActivePage() {
        const page = getCurrentPage();
        const el = pageElements[state.currentPageIndex];
        if (page && el) renderPage(page, el.canvas);
    }

    function renderPage(page, canvas) {
        const ctx = canvas.getContext('2d');
        const { x, y, w, h } = page.frame;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // フレーム
        ctx.save();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();

        // パネル
        ctx.save();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        for (const p of page.panels) ctx.strokeRect(p.x, p.y, p.w, p.h);
        ctx.restore();

        // バブル（矩形のみの簡易描画）
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.strokeStyle = '#007bff';
        for (const b of page.bubbles) {
            ctx.strokeRect(b.x - b.w, b.y, b.w, b.h); // 右上アンカー
        }
        ctx.restore();
    }

    function getCurrentPage() {
        return state.pages[state.currentPageIndex] || null;
    }

    function setActivePage(index, rerender = true) {
        state.currentPageIndex = Math.max(0, Math.min(index, state.pages.length - 1));
        pageElements.forEach((el, i) => {
            if (!el) return;
            el.indexBadge.textContent = `Page ${i + 1}`;
        });
        if (rerender) renderActivePage();
    }

    /* ---------------------------
       UI
    ----------------------------*/
    function attachToolbarEvents() {
        document.getElementById('toolSerif').addEventListener('click', () => setTool('serif'));
        document.getElementById('toolKoma').addEventListener('click', () => setTool('koma'));
        document.getElementById('toolSelect').addEventListener('click', () => setTool(null));

        document.getElementById('btnCopy').addEventListener('click', exportText);
        document.getElementById('btnPaste').addEventListener('click', importText);

        fontSizeRange.addEventListener('input', updateFontSize);
    }

    function setTool(toolName) {
        if (state.currentTool === toolName) state.currentTool = null;
        else state.currentTool = toolName;
        clearSelection();
        updateUI();
        renderActivePage();
    }

    function updateUI() {
        document.getElementById('toolSerif').classList.toggle('active', state.currentTool === 'serif');
        document.getElementById('toolKoma').classList.toggle('active', state.currentTool === 'koma');
        document.getElementById('toolSelect').classList.toggle('active', state.currentTool === null);
    }

    function updateFontSize(e) {
        const newSize = parseInt(e.target.value, 10);
        state.defaultFontSize = newSize;
        fontSizeValueDisplay.innerHTML = `${newSize}<br>px`;
        const selectedBubble = getSelectedBubble();
        if (selectedBubble) {
            selectedBubble.font = newSize;
            measureBubbleSize(selectedBubble);
            if (bubbleEditor.style.display === 'block') updateBubbleEditorPosition(selectedBubble);
            saveAndRenderActivePage();
        }
    }

    function clearSelection() {
        state.selectedBubbleId = null;
        bubbleEditor.style.display = 'none';
    }

    function getSelectedBubble() {
        const page = getCurrentPage();
        if (!page) return null;
        return page.bubbles.find(b => b.id === state.selectedBubbleId) || null;
    }

    /* ---------------------------
       バブル（フキダシ）
    ----------------------------*/
    function createBubble(panel, x, y) {
        const id = state.idCounter++;
        const font = state.defaultFontSize;
        const b = {
            id,
            text: '',
            x: Math.min(panel.x + panel.w - 10, Math.max(panel.x + 10, x)),
            y: Math.min(panel.y + 10, Math.max(panel.y, y)),
            w: 100,
            h: 120,
            font
        };
        measureBubbleSize(b);
        const page = getCurrentPage();
        page.bubbles.push(b);
        return b;
    }

    function measureBubbleSize(bubble) {
        // 簡易：フォントサイズに比例
        const lines = (bubble.text || '').split('\n');
        const charPerLine = 10;
        const cols = Math.max(1, Math.max(...lines.map(s => Math.ceil(s.length / charPerLine))));
        const rows = Math.max(1, lines.length);
        bubble.w = Math.max(60, cols * (bubble.font + 6));
        bubble.h = Math.max(40, rows * (bubble.font + 8));
    }

    function showBubbleEditor(bubble) {
        state.selectedBubbleId = bubble.id;
        bubbleEditor.value = bubble.text;
        bubbleEditor.style.display = 'block';
        updateBubbleEditorPosition(bubble);
        bubbleEditor.focus();
    }

    // v14: transform で配置（left/top固定のまま translate ）
    function updateBubbleEditorPosition(bubble) {
        const canvas = pageElements[state.currentPageIndex].canvas;

        // bubble.x, bubble.y は「右上」アンカー
        // コンテナ(#canvasContainer)基準の left/top を算出し、transformで配置する
        const baseLeft = canvas.offsetLeft + (bubble.x - bubble.w);
        const baseTop  = canvas.offsetTop + bubble.y;

        // サイズは先に確定
        const editorWidth = bubble.w;
        const editorHeight = bubble.h;
        bubbleEditor.style.width = `${editorWidth}px`;
        bubbleEditor.style.height = `${editorHeight}px`;

        bubbleEditor.style.left = '0px';
        bubbleEditor.style.top = '0px';
        bubbleEditor.style.transform = `translate(${baseLeft}px, ${baseTop}px)`;
    }

    bubbleEditor.addEventListener('input', () => {
        const b = getSelectedBubble();
        if (!b) return;
        b.text = bubbleEditor.value;
        measureBubbleSize(b);
        updateBubbleEditorPosition(b);
        renderActivePage();
    });

    bubbleEditor.addEventListener('blur', () => {
        const b = getSelectedBubble();
        if (!b) return;
        b.text = bubbleEditor.value;
        measureBubbleSize(b);
        bubbleEditor.style.display = 'none';
        saveAndRenderActivePage();
    });

    /* ---------------------------
       コマ（簡易：配列管理のまま）
    ----------------------------*/
    function findPanels(page) {
        if (page.panels.length === 0) {
            // 全面を1コマ扱い
            const { x, y, w, h } = page.frame;
            return [{ x, y, w, h }];
        }
        return page.panels.slice();
    }

    function findPanelAt(page, x, y) {
        const panels = findPanels(page);
        return panels.find(p => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) || null;
    }

    /* ---------------------------
       キャンバスイベント
    ----------------------------*/
    function attachCanvasEvents(canvas) {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove, { passive: false });
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerCancel);
    }

    let activePointerId = null;
    let isDragging = false; // コマ線ドラッグ
    let isDraggingBubble = false; // フキダシドラッグ
    let dragStartX = 0, dragStartY = 0;
    let dragCurrentX = 0, dragCurrentY = 0;
    let dragBubbleOffsetX = 0, dragBubbleOffsetY = 0; 

    // --- スクロールロック（Safari慣性対策） ---
    let __scrollLocked = false;
    let __scrollLockY = 0;

    function lockScroll() {
        if (__scrollLocked) return;
        __scrollLocked = true;
        __scrollLockY = window.scrollY || 0;
        document.body.style.position = 'fixed';
        document.body.style.top = (-__scrollLockY) + 'px';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        // コンテナ側も慣性抑止
        canvasContainer.style.overscrollBehavior = 'contain';
        canvasContainer.style.touchAction = 'none';
    }
    function unlockScroll() {
        if (!__scrollLocked) return;
        __scrollLocked = false;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        canvasContainer.style.overscrollBehavior = '';
        canvasContainer.style.touchAction = '';
        window.scrollTo(0, __scrollLockY);
    }

    function getCanvasCoords(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return { x, y };
    }

    function getPageIndex(e) {
        return parseInt(e.target.dataset.pageIndex, 10);
    }

    function onPointerDown(e) {
        if (activePointerId !== null) return;
        
        const pageIndex = getPageIndex(e);
        setActivePage(pageIndex, false); 
        
        const { x, y } = getCanvasCoords(e);
        const page = getCurrentPage();
        if (!page) return;

        clearSelection();
        const panel = findPanelAt(page, x, y);
        if (!panel) return; // ページ外枠（パディング）をクリック

        if (state.currentTool === 'serif') {
            const clickedBubble = findBubbleAt(page, panel, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                showBubbleEditor(clickedBubble);
            } else {
                const newBubble = createBubble(panel, x, y);
                state.selectedBubbleId = newBubble.id;
                showBubbleEditor(newBubble);
            }
        } else if (state.currentTool === 'koma') {
            isDragging = true;
            dragStartX = x; dragStartY = y;
            dragCurrentX = x; dragCurrentY = y;
            try {
                activePointerId = e.pointerId;
                e.target.setPointerCapture(e.pointerId); 
            } catch (err) {}

        } else {
            // 選択モード (ツールがnull)
            const clickedBubble = findBubbleAt(page, panel, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                isDraggingBubble = true;
                lockScroll();
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
                try {
                    activePointerId = e.pointerId;
                    e.target.setPointerCapture(e.pointerId); 
                } catch (err) { console.warn("Pointer capture failed:", err); }
            }
        }
        
        updateUI();
        renderActivePage();
    }

    function onPointerMove(e) {
        if (activePointerId !== null && e.pointerId !== activePointerId) return;

        if (isDragging || isDraggingBubble) {
            e.preventDefault(); // スクロール停止
        }
        
        const page = getCurrentPage();
        if (!page) return;
        const { x, y } = getCanvasCoords(e);

        if (isDragging && state.currentTool === 'koma') {
            dragCurrentX = x;
            dragCurrentY = y;
            renderActivePage(); 
        } else if (isDraggingBubble && state.currentTool === null) {
            const bubble = getSelectedBubble();
            if (bubble) {
                bubble.x = x + dragBubbleOffsetX;
                bubble.y = y + dragBubbleOffsetY;
                updateBubbleEditorPosition(bubble);
                renderActivePage();
            }
        }
    }

    function onPointerUp(e) {
        if (activePointerId !== null && e.pointerId !== activePointerId) return;

        if (isDragging && state.currentTool === 'koma') {
            isDragging = false;
            try { e.target.releasePointerCapture(activePointerId); } catch (err) {}
            activePointerId = null;
            
            const { x, y } = getCanvasCoords(e);
            addKomaLine(dragStartX, dragStartY, x, y);
            saveAndRenderActivePage();
        } else if (isDraggingBubble) {
            isDraggingBubble = false;
            unlockScroll();
            try { e.target.releasePointerCapture(activePointerId); } catch (err) {}
            activePointerId = null;
            
            if (bubbleEditor.style.display !== 'block') {
                 saveAndRenderActivePage();
            }
        }
    }
    
    function onPointerCancel(e) {
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        try { e.target.releasePointerCapture(activePointerId); } catch (err) {}
        activePointerId = null;
        if (isDragging) {
            isDragging = false;
            renderActivePage(); 
        }
        if (isDraggingBubble) {
            isDraggingBubble = false;
            unlockScroll();
            if (bubbleEditor.style.display !== 'block') {
                 saveAndRenderActivePage(); 
            }
        }
    }

    /* ---------------------------
       バブル探索（右上アンカー基準）
    ----------------------------*/
    function findBubbleAt(page, panel, x, y) {
        // 右上アンカー矩形内ヒット
        for (let i = page.bubbles.length - 1; i >= 0; i--) {
            const b = page.bubbles[i];
            if (x >= b.x - b.w && x <= b.x && y >= b.y && y <= b.y + b.h) {
                return b;
            }
        }
        return null;
    }

    /* ---------------------------
       コマ線（簡易: 分割を直矩形で作る）
    ----------------------------*/
    function addKomaLine(x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;
        const { x, y, w, h } = page.frame;

        // 角度判定：横 or 縦
        const dx = x2 - x1;
        const dy = y2 - y1;
        const isHorizontal = Math.abs(dy) < Math.abs(dx);

        // まず既存パネルがなければフレームを1枚パネル扱い
        let panels = findPanels(page);
        if (panels.length === 0) panels = [{ x, y, w, h }];

        // クリック位置にあるパネルを対象に2分割
        const panel = panels.find(p => x1 > p.x && x1 < p.x + p.w && y1 > p.y && y1 < p.y + p.h);
        if (!panel) return;

        const idx = page.panels.indexOf(panel);
        if (idx >= 0) page.panels.splice(idx, 1);

        if (isHorizontal) {
            const splitY = Math.max(panel.y + 10, Math.min(panel.y + panel.h - 10, y1));
            const top = { x: panel.x, y: panel.y, w: panel.w, h: splitY - panel.y };
            const bottom = { x: panel.x, y: splitY, w: panel.w, h: panel.y + panel.h - splitY };
            page.panels.push(top, bottom);
        } else {
            const splitX = Math.max(panel.x + 10, Math.min(panel.x + panel.w - 10, x1));
            const left = { x: panel.x, y: panel.y, w: splitX - panel.x, h: panel.h };
            const right = { x: splitX, y: panel.y, w: panel.x + panel.w - splitX, h: panel.h };
            page.panels.push(left, right);
        }
    }

    /* ---------------------------
       並び順（右優先→上優先）
    ----------------------------*/
    function sortBubblesInPanel(arr) {
        arr.sort((a, b) => {
            const dx = (b.x - a.x);
            if (Math.abs(dx) > 10) return dx; // 右が先
            return a.y - b.y; // 上が先
        });
    }

    /* ---------------------------
       コピー（問題5：ガター上も最近傍に仮所属）
    ----------------------------*/
    function exportText() {
        let output = "";
        state.pages.forEach((page, pageIndex) => {
            const panels = findPanels(page);
            let remaining = [...page.bubbles];

            // 各パネルのバケットを先に作成
            const buckets = panels.map(() => []);

            // まず「内側にある」ものをバケットへ
            panels.forEach((panel, i) => {
                const keep = [];
                for (const b of remaining) {
                    if (b.x > panel.x && b.x <= panel.x + panel.w &&
                        b.y >= panel.y && b.y < panel.y + panel.h) {
                        buckets[i].push(b);
                    } else {
                        keep.push(b);
                    }
                }
                remaining = keep;
            });

            // 残ったバブルは最近傍パネルへ仮所属（マンハッタン距離）
            function nearestPanelIndex(b) {
                let bestI = 0, bestD = Infinity;
                for (let i = 0; i < panels.length; i++) {
                    const p = panels[i];
                    const dx = (b.x < p.x) ? (p.x - b.x) : (b.x > p.x + p.w ? b.x - (p.x + p.w) : 0);
                    const dy = (b.y < p.y) ? (p.y - b.y) : (b.y > p.y + p.h ? b.y - (p.y + p.h) : 0);
                    const d = dx + dy;
                    if (d < bestD) { bestD = d; bestI = i; }
                }
                return bestI;
            }
            for (const b of remaining) {
                if (panels.length === 0) continue;
                const i = nearestPanelIndex(b);
                buckets[i].push(b);
            }

            // バケットを読み順で吐き出し（各バケットは右優先→上優先）
            buckets.forEach((arr) => {
                sortBubblesInPanel(arr);
                arr.forEach((bubble) => {
                    output += bubble.text;
                    output += "\n\n";
                });
            });

            if (pageIndex < state.pages.length - 1) {
                output += "\n\n";
            }
        });

        textIO.value = output.trim();
        textIO.style.display = 'block';
        textIO.select();
        try {
            document.execCommand('copy');
            alert('全ページのテキストをコピーしました。');
        } catch (e) {
            alert('コピーに失敗しました。手動でコピーしてください。');
        }
        textIO.style.display = 'none';
    }

    /* ---------------------------
       ペースト（現行のレイアウト維持）
    ----------------------------*/
    function importText() {
        const raw = prompt('貼り付けテキストを入力（空行1つで同ページ、2つ以上で次ページ）:');
        if (!raw || !raw.trim()) return;

        const pagesText = raw.replace(/\r\n/g, '\n').split(/\n{2,}/); // 2個以上の空行でページ区切り
        let insertIndex = state.currentPageIndex;

        for (let i = 0; i < pagesText.length; i++) {
            const pageText = pagesText[i].trim();
            if (!pageText) continue;

            let page = state.pages[insertIndex];
            if (!page) {
                const frame = state.pages[0].frame;
                page = createNewPage(frame);
                state.pages.push(page);
                addPageToDOM(page, insertIndex);
            } else {
                // 既存ページのバブルは一旦クリア（要件に合わせる場合は適宜調整）
                // ここでは追記ではなく貼り直しとする
                page.bubbles = [];
            }

            const frame = page.frame;
            const { w: fw, h: fh } = frame;
            const startX = frame.x + fw - 30; // 右から
            const startY = frame.y + 30; // 上から
            let currentX = startX, currentY = startY;

            pageText.split(/\n{1}\n?/).forEach((block) => {
                const text = block.trim();
                if (!text) return;
                const bubble = {
                    id: state.idCounter++,
                    text,
                    x: currentX,
                    y: currentY,
                    w: 120,
                    h: 120,
                    font: state.defaultFontSize
                };
                measureBubbleSize(bubble);
                page.bubbles.push(bubble);

                // 左に連なる感じ（折り返しは簡易）
                currentX -= (bubble.w + 18);
                if (currentX < frame.x + 30) {
                    currentX = startX;
                    currentY += (bubble.h + 18);
                }
            });

            insertIndex++;
        }

        setActivePage(state.currentPageIndex);
        renderActivePage();
        alert('ペースト完了');
    }

    /* ---------------------------
       保存（必要に応じてlocalStorage等へ）
    ----------------------------*/
    function saveAndRenderActivePage() {
        // TODO: 必要なら保存
        renderActivePage();
    }

    /* ---------------------------
       キーボード
    ----------------------------*/
    document.addEventListener('keydown', (e) => {
        const keyCode = e.code; 
        if (keyCode === 'Escape') {
            if (bubbleEditor.style.display === 'block') bubbleEditor.blur(); 
            else {
                clearSelection();
                updateUI();
                renderActivePage();
            }
        }
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        if (keyCode === 'KeyS' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool('serif'); }
        if (keyCode === 'KeyK' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool('koma'); }
        if (keyCode === 'KeyV' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool(null); }
        if (keyCode === 'KeyC' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); exportText(); }
        if (keyCode === 'KeyP' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); importText(); }
    });

})();
