/* eslint-disable no-unused-vars */
/* 漫画ネーム用Webアプリ v14（UI非変更：問題1/4/5の最小修正のみ） */

document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 (v13) ---
    const STORAGE_KEY = 'manganame-v13'; // [v13]
    const B5_ASPECT_RATIO = Math.sqrt(2);
    const PAGE_FRAME_PADDING = 15;
    const GUTTER_H = 18;
    const GUTTER_V = 9;
    const BUBBLE_PADDING_X = 10;
    const BUBBLE_PADDING_Y = 8;
    const BUBBLE_LINE_HEIGHT = 1.2;
    const SNAP_ANGLE_THRESHOLD = 15;
    const KOMA_TAP_THRESHOLD = 3;

    // --- DOM要素 ---
    const canvasContainer = document.getElementById('canvasContainer');
    const btnSerif = document.getElementById('btnSerif');
    const btnKoma = document.getElementById('btnKoma');
    const sliderFontSize = document.getElementById('sliderFontSize');
    const fontSizeValueDisplay = document.getElementById('fontSizeValueDisplay');
    const btnPageAddBefore = document.getElementById('btnPageAddBefore');
    const btnPageAddAfter = document.getElementById('btnPageAddAfter');
    const btnPageDelete = document.getElementById('btnPageDelete');
    const btnCopyText = document.getElementById('btnCopyText');
    const btnPasteText = document.getElementById('btnPasteText');
    const btnPNG = document.getElementById('btnPNG');

    const pageIndicator = document.getElementById('pageIndicator');
    const bubbleEditor = document.getElementById('bubbleEditor');
    const selectionPanelBubble = document.getElementById('selectionPanelBubble');
    const deleteBubbleBtn = document.getElementById('deleteBubble');

    const textIO = document.getElementById('textIO');

    // --- 状態 ---
    const state = {
        pages: [],                  // {frame:{x,y,w,h}, panels:[{x,y,w,h},...], bubbles:[{id,text,x,y,w,h,font,shape}]}
        currentPageIndex: 0,
        currentTool: null,          // 'serif' | 'koma' | null
        defaultFontSize: 24,
        idCounter: 1,
        dragging: false,
        draggingBubble: false,
        dragStart: { x: 0, y: 0 },
        dragNow:   { x: 0, y: 0 },
        dragOffset: { x: 0, y: 0 },
        selectedBubbleId: null
    };

    const pageElements = []; // {wrapper, canvas}

    // --- スクロールロック（Safari慣性含む） ---
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

    // ================= 初期化 =================
    init();

    function init() {
        // 1ページ目を用意（保存復元があるならそこに差し替え）
        const first = createNewPage();
        state.pages.push(first);
        addPageToDOM(first, 0);
        setActivePage(0);

        // ツールバー
        btnSerif.addEventListener('click', () => setTool('serif'));
        btnKoma.addEventListener('click', () => setTool('koma'));
        sliderFontSize.addEventListener('input', onChangeFontSize);
        btnCopyText.addEventListener('click', exportText);
        btnPasteText.addEventListener('click', importText);
        btnPNG.addEventListener('click', exportPNG);
        btnPageAddBefore.addEventListener('click', () => addPageRelative(-1));
        btnPageAddAfter.addEventListener('click', () => addPageRelative(+1));
        btnPageDelete.addEventListener('click', deleteCurrentPage);

        deleteBubbleBtn?.addEventListener('click', deleteSelectedBubble);

        updateToolbarUI();
        renderActivePage();
    }

    // ================= ページ生成/表示 =================
    function createNewPage() {
        const W = Math.min(760, Math.max(620, Math.floor(window.innerWidth - 2 * PAGE_FRAME_PADDING)));
        const H = Math.round(W * B5_ASPECT_RATIO);
        return {
            frame: { x: PAGE_FRAME_PADDING, y: PAGE_FRAME_PADDING, w: W, h: H },
            panels: [],    // 分割が無ければframeが単一コマ扱い
            bubbles: []    // 右上アンカー
        };
    }
    function addPageToDOM(page, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'page-wrapper';

        const canvas = document.createElement('canvas');
        canvas.className = 'page';
        canvas.dataset.pageIndex = index.toString();
        wrapper.appendChild(canvas);

        canvas.width  = page.frame.w + page.frame.x * 2;
        canvas.height = page.frame.h + page.frame.y * 2;

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove, { passive: false });
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerCancel);

        canvasContainer.appendChild(wrapper);
        pageElements[index] = { wrapper, canvas };
    }
    function setActivePage(i) {
        state.currentPageIndex = Math.max(0, Math.min(i, state.pages.length - 1));
        pageIndicator.textContent = `${state.currentPageIndex + 1} / ${state.pages.length}`;
        renderActivePage();
    }
    function renderActivePage() {
        const page = state.pages[state.currentPageIndex];
        const canvas = pageElements[state.currentPageIndex].canvas;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 枠
        const f = page.frame;
        ctx.save();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(f.x, f.y, f.w, f.h);
        ctx.restore();

        // パネル
        ctx.save();
        ctx.strokeStyle = '#555';
        for (const p of findPanels(page)) ctx.strokeRect(p.x, p.y, p.w, p.h);
        ctx.restore();

        // バブル（矩形のみ簡易描画／右上アンカー基準）
        ctx.save();
        ctx.strokeStyle = '#007bff';
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        for (const b of page.bubbles) {
            ctx.strokeRect(b.x - b.w, b.y, b.w, b.h);
        }
        ctx.restore();
    }

    // ================= UI =================
    function setTool(t) {
        state.currentTool = (state.currentTool === t) ? null : t;
        selectionPanelBubble?.classList.remove('show');
        bubbleEditor.style.display = 'none';
        updateToolbarUI();
    }
    function updateToolbarUI() {
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');
        sliderFontSize.value = state.defaultFontSize;
        fontSizeValueDisplay.textContent = `${state.defaultFontSize}px`;
    }
    function onChangeFontSize(e) {
        state.defaultFontSize = parseInt(e.target.value, 10) || 24;
        fontSizeValueDisplay.textContent = `${state.defaultFontSize}px`;
        const b = getSelectedBubble();
        if (b) {
            b.font = state.defaultFontSize;
            measureBubbleSize(b);
            if (bubbleEditor.style.display === 'block') updateBubbleEditorPosition(b);
            renderActivePage();
        }
    }

    // ================= パネル =================
    function findPanels(page) {
        if (!page.panels || page.panels.length === 0) {
            const { x, y, w, h } = page.frame;
            return [{ x, y, w, h }];
        }
        return page.panels;
    }
    function findPanelAt(page, x, y) {
        const panels = findPanels(page);
        for (const p of panels) if (x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) return p;
        return null;
    }

    // ================= バブル =================
    function createBubble(panel, x, y) {
        const id = state.idCounter++;
        const b = {
            id,
            text: '',
            x: Math.min(panel.x + panel.w - 6, Math.max(panel.x + 6, x)), // 右上アンカーx
            y: Math.min(panel.y + 6, Math.max(panel.y, y)),               // 右上アンカーy
            w: 120,
            h: 120,
            font: state.defaultFontSize,
            shape: 'ellipse'
        };
        measureBubbleSize(b);
        state.pages[state.currentPageIndex].bubbles.push(b);
        return b;
    }
    function getSelectedBubble() {
        const page = state.pages[state.currentPageIndex];
        return page.bubbles.find(b => b.id === state.selectedBubbleId) || null;
    }
    function deleteSelectedBubble() {
        const page = state.pages[state.currentPageIndex];
        const i = page.bubbles.findIndex(b => b.id === state.selectedBubbleId);
        if (i >= 0) {
            page.bubbles.splice(i, 1);
            state.selectedBubbleId = null;
            bubbleEditor.style.display = 'none';
            renderActivePage();
        }
    }
    function measureBubbleSize(b) {
        // 簡易計測：文字数から列×行を推定（縦書き）
        const lines = (b.text || '').split('\n');
        const charPerLine = 10;
        const cols = Math.max(1, Math.max(...lines.map(s => Math.ceil(s.length / charPerLine))));
        const rows = Math.max(1, lines.length);

        b.w = Math.max(60, cols * (b.font + 6));
        b.h = Math.max(40, rows * (b.font + 8));
    }
    function showBubbleEditor(b) {
        state.selectedBubbleId = b.id;
        bubbleEditor.value = b.text;
        bubbleEditor.style.display = 'block';
        updateBubbleEditorPosition(b);
        bubbleEditor.focus();
    }
    // ---- 位置ズレ防止：transform 移動（コンテナ基準）----
    function updateBubbleEditorPosition(bubble) {
        const canvas = pageElements[state.currentPageIndex].canvas;

        const baseLeft = canvas.offsetLeft + (bubble.x - bubble.w);
        const baseTop  = canvas.offsetTop + bubble.y;

        bubbleEditor.style.width = `${bubble.w}px`;
        bubbleEditor.style.height = `${bubble.h}px`;

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
        renderActivePage();
    });

    // ================= キャンバス・ポインタ =================
    function canvasFromEvent(e) {
        return e.currentTarget;
    }
    function canvasXY(e) {
        const canvas = canvasFromEvent(e);
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function setPointerCaptureSafe(e) {
        try { canvasFromEvent(e).setPointerCapture(e.pointerId); } catch {}
    }
    function releasePointerCaptureSafe(e) {
        try { canvasFromEvent(e).releasePointerCapture(e.pointerId); } catch {}
    }
    function onPointerDown(e) {
        const pageIndex = parseInt(canvasFromEvent(e).dataset.pageIndex || '0', 10);
        setActivePage(pageIndex);

        const { x, y } = canvasXY(e);
        const page = state.pages[state.currentPageIndex];
        const panel = findPanelAt(page, x, y);
        if (!panel) return;

        if (state.currentTool === 'serif') {
            // 既存バブルか新規作成
            const b = hitBubble(page, x, y) || createBubble(panel, x, y);
            showBubbleEditor(b);
        } else if (state.currentTool === 'koma') {
            state.dragging = true;
            state.dragStart = { x, y };
            state.dragNow = { x, y };
            setPointerCaptureSafe(e);
        } else { // 選択モード：バブル移動
            const b = hitBubble(page, x, y);
            if (b) {
                state.selectedBubbleId = b.id;
                state.draggingBubble = true;
                state.dragOffset = { x: b.x - x, y: b.y - y };
                setPointerCaptureSafe(e);
                lockScroll(); // ←ドラッグ中は必ず固定
                renderActivePage();
                return;
            }
        }
        renderActivePage();
    }
    function onPointerMove(e) {
        if (state.dragging || state.draggingBubble) e.preventDefault(); // スクロール抑止
        const { x, y } = canvasXY(e);
        if (state.dragging) {
            state.dragNow = { x, y };
            renderActivePage(); // ガイド等あれば
        } else if (state.draggingBubble) {
            const b = getSelectedBubble();
            if (!b) return;
            b.x = x + state.dragOffset.x;
            b.y = y + state.dragOffset.y;
            updateBubbleEditorPosition(b);
            renderActivePage();
        }
    }
    function onPointerUp(e) {
        if (state.dragging) {
            state.dragging = false;
            releasePointerCaptureSafe(e);
            const { x, y } = canvasXY(e);
            addKomaLine(state.dragStart.x, state.dragStart.y, x, y);
            renderActivePage();
        } else if (state.draggingBubble) {
            state.draggingBubble = false;
            releasePointerCaptureSafe(e);
            unlockScroll(); // ←解除
            renderActivePage();
        }
    }
    function onPointerCancel(e) {
        if (state.dragging) {
            state.dragging = false;
            releasePointerCaptureSafe(e);
            renderActivePage();
        }
        if (state.draggingBubble) {
            state.draggingBubble = false;
            releasePointerCaptureSafe(e);
            unlockScroll();
            renderActivePage();
        }
    }
    function hitBubble(page, x, y) {
        for (let i = page.bubbles.length - 1; i >= 0; i--) {
            const b = page.bubbles[i];
            if (x >= b.x - b.w && x <= b.x && y >= b.y && y <= b.y + b.h) return b;
        }
        return null;
    }

    // ================= コマ割り（配列管理のまま） =================
    function addKomaLine(x1, y1, x2, y2) {
        const page = state.pages[state.currentPageIndex];
        const f = page.frame;

        // 水平/垂直を判定
        const dx = x2 - x1, dy = y2 - y1;
        const horizontal = Math.abs(dy) < Math.abs(dx);

        let panels = findPanels(page);
        if (panels.length === 0) panels = [{ x: f.x, y: f.y, w: f.w, h: f.h }];

        const target = panels.find(p => x1 > p.x && x1 < p.x + p.w && y1 > p.y && y1 < p.y + p.h);
        if (!target) return;

        // 既存の panels から対象を取り除き、2分割をpush
        const idx = page.panels.findIndex(p => p === target);
        if (idx >= 0) page.panels.splice(idx, 1);

        if (horizontal) {
            const splitY = Math.max(target.y + 10, Math.min(target.y + target.h - 10, y1));
            const top    = { x: target.x, y: target.y, w: target.w, h: splitY - target.y };
            const bottom = { x: target.x, y: splitY,   w: target.w, h: target.y + target.h - splitY };
            page.panels.push(top, bottom);
        } else {
            const splitX = Math.max(target.x + 10, Math.min(target.x + target.w - 10, x1));
            const left   = { x: target.x, y: target.y, w: splitX - target.x, h: target.h };
            const right  = { x: splitX,   y: target.y, w: target.x + target.w - splitX, h: target.h };
            page.panels.push(left, right);
        }
    }

    // ================= 並び順（右優先→上優先） =================
    function sortBubblesInPanel(arr) {
        arr.sort((a, b) => {
            const dx = (b.x - a.x);
            if (Math.abs(dx) > 10) return dx; // 右が先
            return a.y - b.y; // 上が先
        });
    }

    // ================= コピー/ペースト =================
    // 問題5: パネル外も最近傍パネルへ仮所属して出力
    function exportText() {
        let output = "";
        state.pages.forEach((page, pi) => {
            const panels = findPanels(page);
            let remaining = [...page.bubbles];

            // バケット
            const buckets = panels.map(() => []);

            // 内部にあるものを振り分け
            panels.forEach((p, i) => {
                const keep = [];
                for (const b of remaining) {
                    if (b.x > p.x && b.x <= p.x + p.w && b.y >= p.y && b.y < p.y + p.h) {
                        buckets[i].push(b);
                    } else {
                        keep.push(b);
                    }
                }
                remaining = keep;
            });

            // 残りは最近傍へ（マンハッタン距離）
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
                if (panels.length === 0) continue; // 念のため
                buckets[nearestPanelIndex(b)].push(b);
            }

            // 各パネル内は右優先→上優先で並べて出力
            buckets.forEach((arr) => {
                sortBubblesInPanel(arr);
                arr.forEach((bubble) => {
                    output += bubble.text;
                    output += "\n\n";
                });
            });

            if (pi < state.pages.length - 1) output += "\n\n";
        });

        textIO.value = output.trim();
        textIO.style.display = 'block';
        textIO.select();
        try {
            document.execCommand('copy');
            alert('全ページのテキストをコピーしました。');
        } catch {
            alert('コピーに失敗しました。手動でコピーしてください。');
        }
        textIO.style.display = 'none';
    }

    function importText() {
        const raw = prompt('貼り付けテキストを入力（空行1つで同ページ、2つ以上で次ページ）:');
        if (!raw || !raw.trim()) return;

        // 2つ以上の空行でページ区切り
        const pagesText = raw.replace(/\r\n/g, '\n').split(/\n{2,}/);
        let insertIndex = state.currentPageIndex;

        for (let i = 0; i < pagesText.length; i++) {
            const pageText = pagesText[i].trim();
            if (!pageText) continue;

            let page = state.pages[insertIndex];
            if (!page) {
                const newPage = createNewPage();
                state.pages.push(newPage);
                addPageToDOM(newPage, insertIndex);
                page = newPage;
            } else {
                // 追記ではなく上書き（必要なら仕様変更可）
                page.bubbles = [];
            }

            const f = page.frame;
            const startX = f.x + f.w - 30;  // 右上
            const startY = f.y + 30;        // 上端
            let currentX = startX, currentY = startY;

            pageText.split(/\n{1}\n?/).forEach(block => {
                const text = block.trim();
                if (!text) return;
                const b = {
                    id: state.idCounter++,
                    text,
                    x: currentX,
                    y: currentY,
                    w: 120,
                    h: 120,
                    font: state.defaultFontSize,
                    shape: 'ellipse'
                };
                measureBubbleSize(b);
                page.bubbles.push(b);

                // 左へ連なる。足りなければ折り返して次段の右端から
                currentX -= (b.w + 18);
                if (currentX < f.x + 30) {
                    currentX = startX;
                    currentY += (b.h + 18);
                }
            });

            insertIndex++;
        }

        setActivePage(state.currentPageIndex);
        renderActivePage();
        alert('ペースト完了');
    }

    // ================= ページ操作/PNG =================
    function addPageRelative(delta) {
        const idx = state.currentPageIndex + (delta < 0 ? 0 : 1);
        const page = createNewPage();
        state.pages.splice(idx, 0, page);

        // DOM挿入位置は末尾→今は簡略で末尾追加＋再計算でもOK（最小改修）
        addPageToDOM(page, state.pages.length - 1);
        setActivePage(idx);
    }
    function deleteCurrentPage() {
        if (state.pages.length <= 1) return;
        state.pages.splice(state.currentPageIndex, 1);
        // 再描画・インデックス整備（簡略）
        canvasContainer.innerHTML = '';
        pageElements.length = 0;
        state.pages.forEach((p, i) => addPageToDOM(p, i));
        setActivePage(Math.max(0, state.currentPageIndex - 1));
    }
    function exportPNG() {
        const page = state.pages[state.currentPageIndex];
        const canvas = pageElements[state.currentPageIndex].canvas;
        // 既存の描画をそのままPNG化（最低限）
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `page-${state.currentPageIndex + 1}.png`;
        a.click();
    }

    // ================= キーボード =================
    document.addEventListener('keydown', (e) => {
        if (e.target === bubbleEditor) return;
        if (e.code === 'KeyS') setTool('serif');
        if (e.code === 'KeyK') setTool('koma');
        if (e.code === 'KeyV') setTool(null);
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyC') { e.preventDefault(); exportText(); }
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyP') { e.preventDefault(); importText(); }
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyN') { e.preventDefault(); exportPNG(); }
    });

});
