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
    const btnZIP = document.getElementById('btnZIP');
    const btnResetPageEl = document.getElementById('btnResetPage'); // ページリセット
    const btnResetAllEl = document.getElementById('btnReset');    // 全削除
    const selectionPanelBubble = document.getElementById('selectionPanelBubble');
    const shapeEllipse = document.getElementById('shapeEllipse');
    const shapeRect = document.getElementById('shapeRect');
    const deleteBubble = document.getElementById('deleteBubble');
    const bubbleEditor = document.getElementById('bubbleEditor');
    const textIO = document.getElementById('textIO');
    const pageIndicator = document.getElementById('pageIndicator');

    // --- アプリケーション状態 ---
    let state = {
        pages: [], // [v13] { id, frame, panels: [], bubbles: [] }
        currentPageIndex: 0, 
        currentTool: null, 
        defaultFontSize: 16,
        selectedBubbleId: null,
        // selectedGutterId: null, // [v13] 廃止
        dpr: window.devicePixelRatio || 1,
    };
    
    let pageElements = []; // { wrapper: div, canvas: canvas, ctx: ctx }
    let activePointerId = null; // [v13] キャプチャ中のポインターID

    // ドラッグ状態
    let isDragging = false; // コマ枠用
    let isDraggingBubble = false; // フキダシドラッグ用
    let dragStartX = 0, dragStartY = 0;
    let dragCurrentX = 0, dragCurrentY = 0;
    let dragBubbleOffsetX = 0, dragBubbleOffsetY = 0; 

    // --- 初期化 ---
    function init() {
        registerServiceWorker();
        loadState();
        setupEventListeners();
        createPageDOMElements();
        // [v13修正] resizeAllCanvas は DOM 描画後に実行
        requestAnimationFrame(() => {
            resizeAllCanvas(); 
            updateUI();
            setActivePage(state.currentPageIndex, false); 
            updatePageIndicator(); 
        });
    }

    // --- PWA (Service Worker) ---
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered.', reg))
                .catch(err => console.error('Service Worker registration failed.', err));
        }
    }

    // --- 状態管理 (LocalStorage) ---
    function saveState() {
        try {
            const dataToSave = {
                pages: state.pages,
                currentPageIndex: state.currentPageIndex,
                defaultFontSize: state.defaultFontSize,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        } catch (e) {
            console.error("Failed to save state:", e);
        }
    }

    function loadState() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
            try {
                const loadedData = JSON.parse(savedData);
                // [v13] panels 方式かチェック
                if (loadedData.pages && loadedData.pages[0] && loadedData.pages[0].panels) {
                    state.pages = loadedData.pages || [];
                    state.currentPageIndex = loadedData.currentPageIndex || 0;
                    state.defaultFontSize = loadedData.defaultFontSize || 16;
                } else {
                    // [v13] v12以前のデータ(gutters)は互換性がないため、リセット
                    throw new Error("Old data structure (gutters). Resetting.");
                }
                
                if (state.pages.length === 0 || state.currentPageIndex >= state.pages.length) {
                    initNewState();
                }
            } catch (e) {
                console.error("Failed to load state, initializing:", e);
                initNewState();
            }
        } else {
            initNewState();
        }
        sliderFontSize.value = state.defaultFontSize;
        fontSizeValueDisplay.innerHTML = `${state.defaultFontSize}<br>px`;
    }
    
    // [v13新設]
    function initNewState() {
        state.pages = [];
        state.pages.push(createNewPage(null)); // frameはnullで初期化
        state.currentPageIndex = 0;
    }

    // --- ページDOM生成 ---
    function createPageDOMElements() {
        canvasContainer.innerHTML = ''; 
        pageElements = []; 
        state.pages.forEach((page, index) => {
            addPageToDOM(page, index);
        });
    }

    function addPageToDOM(page, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'page-wrapper';
        wrapper.dataset.pageIndex = index;
        const canvas = document.createElement('canvas');
        canvas.className = 'mainCanvas';
        canvas.dataset.pageIndex = index; 
        const ctx = canvas.getContext('2d');
        wrapper.appendChild(canvas);
        const elementRef = { wrapper, canvas, ctx };
        if (index >= pageElements.length) {
            canvasContainer.appendChild(wrapper);
            pageElements.push(elementRef);
        } else {
            const nextElement = pageElements[index];
            canvasContainer.insertBefore(wrapper, nextElement.wrapper);
            pageElements.splice(index, 0, elementRef);
        }
        setupCanvasEventListeners(canvas);
        return elementRef;
    }

    // --- キャンバスリサイズ (全ページ) ---
    function resizeAllCanvas() {
        state.dpr = window.devicePixelRatio || 1;
        if (pageElements.length === 0) return;
        const firstCanvas = pageElements[0].canvas;
        if (!firstCanvas.clientWidth) {
            setTimeout(resizeAllCanvas, 50);
            return;
        }
        const cssWidth = firstCanvas.clientWidth;
        const cssHeight = cssWidth * B5_ASPECT_RATIO;
        const canvasWidth = Math.round(cssWidth * state.dpr);
        const canvasHeight = Math.round(cssHeight * state.dpr);
        const frameW = cssWidth - PAGE_FRAME_PADDING * 2;
        const frameH = cssHeight - PAGE_FRAME_PADDING * 2;
        pageElements.forEach((el, index) => {
            const page = state.pages[index];
            if (!page) return;
            el.canvas.width = canvasWidth;
            el.canvas.height = canvasHeight;
            el.ctx.scale(state.dpr, state.dpr);
            
            const oldFrame = page.frame;
            const newFrame = { 
                x: PAGE_FRAME_PADDING, y: PAGE_FRAME_PADDING, 
                w: frameW, h: frameH 
            };
            page.frame = newFrame;
            
            // [v13] リサイズ時にパネルとフキダシの座標もスケーリング
            if (oldFrame && oldFrame.w > 0 && oldFrame.h > 0) {
                const scaleX = newFrame.w / oldFrame.w;
                const scaleY = newFrame.h / oldFrame.h;
                page.panels.forEach(p => {
                    p.x = newFrame.x + (p.x - oldFrame.x) * scaleX;
                    p.y = newFrame.y + (p.y - oldFrame.y) * scaleY;
                    p.w *= scaleX;
                    p.h *= scaleY;
                });
                page.bubbles.forEach(b => {
                    b.x = newFrame.x + (b.x - oldFrame.x) * scaleX;
                    b.y = newFrame.y + (b.y - oldFrame.y) * scaleY;
                    // w/h は measureBubbleSize で再計算される
                });
            } else if (page.panels.length === 0) {
                // [v13] 起動時バグ修正：frameが計算されたら、最初のパネルを追加
                page.panels = [createNewPanel(page.frame)];
            }
            
            renderPage(page, el.canvas);
        });
    }

    // --- UI更新 ---
    function updateUI() {
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');
        pageElements.forEach(el => {
            el.canvas.classList.remove('tool-serif', 'tool-koma');
            if (state.currentTool === 'serif') el.canvas.classList.add('tool-serif');
            else if (state.currentTool === 'koma') el.canvas.classList.add('tool-koma');
        });
        const selectedBubble = getSelectedBubble();
        selectionPanelBubble.classList.toggle('show', !!selectedBubble);
        if (!selectedBubble) hideBubbleEditor();
        updatePageIndicator(); 
    }

    function updatePageIndicator() {
        if (pageIndicator) {
            pageIndicator.textContent = `${state.currentPageIndex + 1} / ${state.pages.length}`;
        }
    }

    // --- アクティブページ設定 ---
    function setActivePage(index, scrollToPage = true) {
        if (index < 0 || index >= pageElements.length) return;
        pageElements.forEach(el => el.wrapper.classList.remove('active'));
        const activeElement = pageElements[index];
        activeElement.wrapper.classList.add('active');
        state.currentPageIndex = index;
        updatePageIndicator(); 
        if (scrollToPage) {
            activeElement.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // --- 描画 (指定ページのみ) ---
    function renderPage(page, canvas) {
        if (!page || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx || !page.frame) return;
        const cssWidth = canvas.clientWidth;
        const cssHeight = canvas.clientHeight;
        ctx.save();
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, cssWidth, cssHeight);
        drawPageFrame(page, ctx);
        drawKoma(page, ctx, false); // ガイド線モード
        drawBubbles(page, ctx);
        drawSelection(page, ctx);
        if (state.currentPageIndex === state.pages.indexOf(page)) {
            if (isDragging && state.currentTool === 'koma') {
                drawDragKomaLine(ctx, dragStartX, dragStartY, dragCurrentX, dragCurrentY);
            }
        }
        ctx.restore();
    }
    
    function drawPageFrame(page, context) {
        if (!page.frame) return;
        const { x, y, w, h } = page.frame;
        context.strokeStyle = 'black';
        context.lineWidth = 2; // [v13] 問題5（線の太さ）
        context.strokeRect(x, y, w, h);
    }

    // [v13修正] コマ枠の描画ロジック (panels方式)
    function drawKoma(page, context, isExport = false) {
        if (!page.frame) return;

        // [v13] page.panels を描画するだけ（Tの字バグの根本解決）
        page.panels.forEach(panel => {
            if (isExport) {
                // TODO: 書き出し時のガター（白帯）描画
                // 現状はエディタと同じ枠線のみ
                context.strokeStyle = 'black';
                context.lineWidth = 2; // [v13] 問題5（線の太さ）
                context.strokeRect(panel.x, panel.y, panel.w, panel.h);
            } else {
                // エディタ上: 黒の「実線」
                context.strokeStyle = 'black';
                context.lineWidth = 2; // [v13] 問題5（線の太さ）
                context.setLineDash([]); 
                context.strokeRect(panel.x, panel.y, panel.w, panel.h);
            }
        });
    }

    // [v13修正] ドラッグ中の線も「現在のコマ」の範囲内「だけ」で描画
    function drawDragKomaLine(context, x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page || !page.frame) return;
        
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        
        // [v13] ドラッグ中の「現在」のコマを特定
        const panel = findPanelAt(page, x1, y1);
        if (!panel) return;

        // [v13] パネルの矩形（bounds）でクリップ
        const clipMinX = panel.x;
        const clipMaxX = panel.x + panel.w;
        const clipMinY = panel.y;
        const clipMaxY = panel.y + panel.h;

        context.strokeStyle = '#007bff'; 
        context.lineWidth = 1;
        context.setLineDash([4, 2]); // ドラッグ中だけ点線
        context.beginPath();
        if (dir === 'h') {
            context.moveTo(clipMinX, pos);
            context.lineTo(clipMaxX, pos);
        } else {
            context.moveTo(pos, clipMinY);
            context.lineTo(pos, clipMaxY);
        }
        context.stroke();
        context.setLineDash([]);
    }


    function drawBubbles(page, context) {
        // [v13] フキダシは page 直下
        page.bubbles.forEach(bubble => {
            if (state.selectedBubbleId === bubble.id && bubbleEditor.style.display === 'block') {
                return;
            }
            drawSingleBubble(bubble, context);
        });
    }

    // [v13] フキダシ描画 (右上アンカー)
    function drawSingleBubble(bubble, context) {
        const { x, y, w, h, shape, text, font } = bubble;
        context.save();
        context.translate(x, y); // (x, y) は「右上」
        context.fillStyle = 'white';
        context.strokeStyle = 'black';
        context.lineWidth = 2;
        context.beginPath();
        switch (shape) {
            case 'rect':
                context.rect(-w, 0, w, h);
                break;
            case 'ellipse':
            default:
                context.ellipse(-w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
                break;
        }
        context.closePath();
        context.fill();
        context.stroke();
        context.fillStyle = 'black';
        context.font = `${font}px 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif`;
        context.textAlign = 'center'; 
        context.textBaseline = 'top';
        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; 
        const charHeight = font * BUBBLE_LINE_HEIGHT;  
        let currentX = -BUBBLE_PADDING_X - (columnWidth / 2);
        const startY = BUBBLE_PADDING_Y;
        lines.forEach((line) => {
            let currentY = startY;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                context.fillText(char, currentX, currentY);
                currentY += charHeight * 0.9; 
            }
            currentX -= columnWidth; 
        });
        context.restore();
    }

    function drawSelection(page, context) {
        // フキダシ選択 (右上アンカー)
        const bubble = getSelectedBubble(page);
        if (bubble && bubbleEditor.style.display !== 'block') {
            context.strokeStyle = '#007bff';
            context.lineWidth = 2;
            context.setLineDash([6, 3]);
            context.strokeRect(bubble.x - bubble.w - 2, bubble.y - 2, bubble.w + 4, bubble.h + 4);
            context.setLineDash([]);
        }
    }

    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        window.addEventListener('resize', resizeAllCanvas);
        btnSerif.addEventListener('click', () => setTool('serif'));
        btnKoma.addEventListener('click', () => setTool('koma'));
        sliderFontSize.addEventListener('input', updateFontSize);
        btnPageAddBefore.addEventListener('click', () => addPage(true));
        btnPageAddAfter.addEventListener('click', () => addPage(false));
        btnPageDelete.addEventListener('click', deletePage);
        btnCopyText.addEventListener('click', exportText);
        btnPasteText.addEventListener('click', importText);
        btnPNG.addEventListener('click', exportPNG);
        btnZIP.addEventListener('click', exportZIP);
        btnResetPageEl.addEventListener('click', resetCurrentPage); 
        btnResetAllEl.addEventListener('click', resetAllData); 
        shapeEllipse.addEventListener('click', () => setBubbleShape('ellipse'));
        shapeRect.addEventListener('click', () => setBubbleShape('rect'));
        deleteBubble.addEventListener('click', deleteSelectedBubble);
        bubbleEditor.addEventListener('input', onBubbleEditorInput);
        bubbleEditor.addEventListener('blur', hideBubbleEditor);
        bubbleEditor.addEventListener('keydown', onBubbleEditorKeyDown);
        window.addEventListener('keydown', onKeyDown);
    }
    
    // キャンバス毎のイベントリスナー
    function setupCanvasEventListeners(canvas) {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove, { passive: false }); 
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerCancel); 
    }
    
    // ツール切り替え
    function setTool(toolName) {
        if (state.currentTool === toolName) state.currentTool = null;
        else state.currentTool = toolName;
        clearSelection();
        updateUI();
        renderActivePage();
    }
    
    // 選択解除
    function clearSelection() {
        state.selectedBubbleId = null;
    }

    // アクティブページ（現在選択中のページ）の再描画
    function renderActivePage() {
        const page = getCurrentPage();
        if (!page) return;
        const el = pageElements[state.currentPageIndex];
        if (page && el) renderPage(page, el.canvas);
    }

    // フォントサイズ更新
    function updateFontSize(e) {
        const newSize = parseInt(e.target.value, 10);
        state.defaultFontSize = newSize;
        fontSizeValueDisplay.innerHTML = `${newSize}<br>px`;
        const selectedBubble = getSelectedBubble();
        if (selectedBubble) {
            selectedBubble.font = newSize;
            measureBubbleSize(selectedBubble);
            // [v13] 入力中でもフォントサイズは即時反映
            if (bubbleEditor.style.display === 'block') {
                bubbleEditor.style.fontSize = `${newSize}px`;
                bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
                // フォント変更時はリサイズ＆位置更新を許可
                measureBubbleSize(selectedBubble);
                updateBubbleEditorPosition(selectedBubble);
            }
            saveAndRenderActivePage();
        }
    }

    // --- キャンバスイベント ---
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
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
                // [v13] ポインターキャプチャでスクロールを止める
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
                if (bubbleEditor.style.display === 'block') {
                    updateBubbleEditorPosition(bubble);
                }
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
            if (bubbleEditor.style.display !== 'block') {
                 saveAndRenderActivePage(); 
            }
        }
    }
    
    // --- キーボードイベント ---
    function onKeyDown(e) {
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
    }

    // --- ページ管理ロジック ---
    function getCurrentPage() {
        return state.pages[state.currentPageIndex] || null;
    }

    // [v13]
    function createNewPage(frame) {
        const id = `page_${Date.now()}`;
        const initialPanel = frame ? createNewPanel(frame) : null;
        return { 
            id: id, 
            frame: frame, 
            panels: initialPanel ? [initialPanel] : [], // [v13]
            bubbles: [] // [v13] bubbles は page 直下
        };
    }
    
    // [v13]
    function createNewPanel(frame) {
        return {
            id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            x: frame.x,
            y: frame.y,
            w: frame.w,
            h: frame.h,
        };
    }

    function addPage(before = false) {
        const frame = state.pages.length > 0 ? state.pages[0].frame : null;
        const newPage = createNewPage(frame);
        const newIndex = state.currentPageIndex + (before ? 0 : 1);
        state.pages.splice(newIndex, 0, newPage);
        const newEl = addPageToDOM(newPage, newIndex);
        updatePageIndices();
        resizeAllCanvas(); 
        setActivePage(newIndex, true);
        saveState();
    }

    function deletePage() {
        if (state.pages.length <= 1) {
            resetCurrentPage(); 
            return;
        }
        const deleteIndex = state.currentPageIndex;
        pageElements[deleteIndex].wrapper.remove();
        pageElements.splice(deleteIndex, 1);
        state.pages.splice(deleteIndex, 1);
        updatePageIndices();
        const newIndex = Math.max(0, deleteIndex - 1); 
        setActivePage(newIndex, true);
        saveState();
    }
    
    function updatePageIndices() {
        pageElements.forEach((el, index) => {
            el.wrapper.dataset.pageIndex = index;
            el.canvas.dataset.pageIndex = index;
        });
        updatePageIndicator(); 
    }
    
    function resetCurrentPage() {
        const page = getCurrentPage();
        if (page) {
            // [v13] 最初のパネル（外枠）だけを残す
            page.panels = [createNewPanel(page.frame)];
            page.bubbles = [];
            clearSelection();
            saveAndRenderActivePage();
        }
    }

    function resetAllData() {
        if (confirm("本当にリセットしますか？\nすべてのページとデータが消去されます。")) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    }

    // --- セリフ (フキダシ) ロジック ---
    function createBubble(panel, x, y) {
        const page = getCurrentPage();
        if (!page) return null; 
        const bubble = {
            id: `bubble_${Date.now()}`,
            x: x, y: y, // [v13] (x, y) は「右上」
            w: 100, h: 50, 
            text: "", // [v13修正] "セリフ" -> "" (空)
            shape: 'ellipse',
            font: state.defaultFontSize,
            panelId: panel.id // [v13] 属するパネルを記録
        };
        measureBubbleSize(bubble); 
        page.bubbles.push(bubble);
        return bubble;
    }

    function findBubbleAt(page, panel, x, y) {
        if (!page) return null;
        // [v13] page直下のbubblesを検索
        for (let i = page.bubbles.length - 1; i >= 0; i--) {
            const b = page.bubbles[i];
            if (x >= b.x - b.w && x <= b.x && y >= b.y && y <= b.y + b.h) {
                return b;
            }
        }
        return null;
    }

    function showBubbleEditor(bubble) {
        hideBubbleEditor(); 
        state.selectedBubbleId = bubble.id;
        bubbleEditor.value = bubble.text;
        bubbleEditor.style.display = 'block';
        bubbleEditor.style.fontSize = `${bubble.font}px`;
        bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
        updateBubbleEditorPosition(bubble);
        bubbleEditor.focus();
        // [v13修正] 空の場合はselect()しない
        if (bubble.text) {
            bubbleEditor.select();
        }
        updateUI();
        renderActivePage();
    }
    
    // [v13修正] セリフ入力バグ修正 (style.right を使う)
    function updateBubbleEditorPosition(bubble) {
        const canvas = pageElements[state.currentPageIndex].canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const containerScrollTop = canvasContainer.scrollTop;
        
        const editorWidth = bubble.w;
        const editorHeight = bubble.h;
        bubbleEditor.style.width = `${editorWidth}px`;
        bubbleEditor.style.height = `${editorHeight}px`;

        // [v13] (x, y) は「右上」アンカー
        // (x) から「画面の右端」までの距離を計算して style.right を設定
        const canvasRightEdge = canvasRect.left + canvas.clientWidth;
        const bubbleRightEdge = canvasRect.left + bubble.x;
        bubbleEditor.style.right = `${canvasRightEdge - bubbleRightEdge}px`;
        bubbleEditor.style.top = `${canvasRect.top + containerScrollTop + bubble.y}px`; // (y)
    }

    function hideBubbleEditor() {
        if (bubbleEditor.style.display === 'block') {
            bubbleEditor.style.display = 'none';
            const bubble = getSelectedBubble();
            if (bubble) {
                // [v13修正] 入力確定（blur）時にリサイズ
                measureBubbleSize(bubble); 
                if (bubble.text.trim() === "") {
                    deleteSelectedBubble(); 
                    state.selectedBubbleId = null;
                } else {
                    saveAndRenderActivePage();
                }
            }
        }
    }

    // [v13修正] セリフ入力バグ修正 (リサイズを復活)
    function onBubbleEditorInput(e) {
        const bubble = getSelectedBubble();
        if (bubble) {
            bubble.text = e.target.value;
            // [v13] 入力中も即リサイズ＆エディタ位置更新
            measureBubbleSize(bubble);
            updateBubbleEditorPosition(bubble);
            // renderActivePage(); // 描画は不要（TextAreaが上にあるため）
        }
    }
    
    function onBubbleEditorKeyDown(e) { /* Escはグローバルで処理 */ }

    // 縦書き用のサイズ測定
    function measureBubbleSize(bubble) {
        const { text, font } = bubble;
        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; 
        const charHeight = font * BUBBLE_LINE_HEIGHT * 0.9; 
        let maxHeight = 0;
        lines.forEach(line => {
            const height = line.length * charHeight;
            if (height > maxHeight) maxHeight = height;
        });
        if (maxHeight === 0) { // [v13修正] 空白でも最低サイズを確保
             maxHeight = font;
        }
        const totalWidth = lines.length * columnWidth;
        bubble.w = totalWidth + BUBBLE_PADDING_X * 2;
        bubble.h = maxHeight + BUBBLE_PADDING_Y * 2;
    }

    function getSelectedBubble(page = getCurrentPage()) {
        if (!page || !state.selectedBubbleId) return null;
        return page.bubbles.find(b => b.id === state.selectedBubbleId);
    }

    function deleteSelectedBubble() {
        const page = getCurrentPage();
        if (!page || !state.selectedBubbleId) return;
        page.bubbles = page.bubbles.filter(b => b.id !== state.selectedBubbleId);
        state.selectedBubbleId = null;
        hideBubbleEditor();
        updateUI();
        saveAndRenderActivePage();
    }

    function setBubbleShape(shape) {
        const bubble = getSelectedBubble();
        if (bubble) {
            bubble.shape = shape;
            saveAndRenderActivePage();
        }
    }

    // --- コマ割りロジック (v13) ---

    // [v13新設] (x, y) が含まれる「パネル（コマ）」を返す
    function findPanelAt(page, x, y) {
        if (!page || !page.panels) return null;
        // 逆順で（＝新しく作られた、より小さいパネルを）先に検索
        for (let i = page.panels.length - 1; i >= 0; i--) {
            const p = page.panels[i];
            if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
                return p;
            }
        }
        return null;
    }


    // [v13] タップ（水平線）判定 + 斜め線は強制スナップ
    function getKomaSnapDirection(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        if (dist < KOMA_TAP_THRESHOLD) {
            return { dir: 'h', pos: y1 }; // タップは水平
        }
        const angle = Math.atan2(dy, dx) * 180 / Math.PI; 
        let dir = null, pos = 0;
        if (Math.abs(angle) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle) >= 180 - SNAP_ANGLE_THRESHOLD) {
            dir = 'h'; pos = y1; 
        } else if (Math.abs(angle - 90) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle + 90) <= SNAP_ANGLE_THRESHOLD) {
            dir = 'v'; pos = x1; 
        } else {
            // [v13] 問題1（斜め線）は未実装。Tの字バグ解決を優先。
            dir = (Math.abs(dx) > Math.abs(dy)) ? 'h' : 'v';
            pos = (dir === 'h') ? y1 : x1;
        }
        return { dir, pos };
    }

    // [v13] addGutter -> addKomaLine に変更
    function addKomaLine(x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;
        
        // 1. どのパネルをクリックしたか特定
        const panel = findPanelAt(page, x1, y1);
        if (!panel) return;
        
        // 2. 線の向きと位置を決定
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        
        // 3. パネルを分割
        splitPanel(page, panel.id, dir, pos);
    }
    
    // [v13新設] パネル分割（Tの字バグの根本解決）
    function splitPanel(page, panelId, dir, pos) {
        const panelIndex = page.panels.findIndex(p => p.id === panelId);
        if (panelIndex === -1) return;
        
        const p = page.panels[panelIndex];
        
        // パネルを2つに分割
        let panelA_bounds, panelB_bounds;
        
        if (dir === 'h') {
            const halfGutter = GUTTER_H / 2;
            // ガターがパネル内に収まるようclamp
            const y1 = Math.max(p.y, pos - halfGutter);
            const y2 = Math.min(p.y + p.h, pos + halfGutter);
            
            panelA_bounds = { x: p.x, y: p.y, w: p.w, h: y1 - p.y };
            panelB_bounds = { x: p.x, y: y2, w: p.w, h: (p.y + p.h) - y2 };
        } else { // dir === 'v'
            const halfGutter = GUTTER_V / 2;
            const x1 = Math.max(p.x, pos - halfGutter);
            const x2 = Math.min(p.x + p.w, pos + halfGutter);
            
            panelA_bounds = { x: p.x, y: p.y, w: x1 - p.x, h: p.h };
            panelB_bounds = { x: x2, y: p.y, w: (p.x + p.w) - x2, h: p.h };
        }
        
        // 4. 古いパネルを削除
        page.panels.splice(panelIndex, 1);
        
        // 5. 新しい2つのパネルを追加
        if (panelA_bounds.w > 1 && panelA_bounds.h > 1) { // 小さすぎるパネルは作らない
            page.panels.push(createNewPanel(panelA_bounds));
        }
        if (panelB_bounds.w > 1 && panelB_bounds.h > 1) {
            page.panels.push(createNewPanel(panelB_bounds));
        }
    }

    // [v13] コマ枠削除は廃止
    function getSelectedGutter(page = getCurrentPage()) { return null; }


    // --- [v13] テキストコピー（コマ順ソート） ---
    
    // [v13] findPanelsは、単にソート済みのpanelsを返すだけ
    function findPanels(page) {
        if (!page.panels) return [];
        // コマを漫画の読み順（上→下、右→左）でソート
        return [...page.panels].sort((a, b) => {
            if (Math.abs(a.y - b.y) < 10) return b.x - a.x; 
            return a.y - b.y; 
        });
    }
    
    // [v13] コマ内のフキダシをソート（右優先→上優先）
    function sortBubblesInPanel(bubbles) {
        return bubbles.sort((a, b) => {
            if (Math.abs(a.x - b.x) < 10) return a.y - b.y; 
            return b.x - a.x; 
        });
    }

    function exportText() {
        let output = "";
        state.pages.forEach((page, pageIndex) => {
            const panels = findPanels(page);
            let bubbles = [...page.bubbles];
            
            panels.forEach((panel) => {
                let bubblesInPanel = [];
                bubbles = bubbles.filter(b => {
                    // [v13] 右上アンカー (b.x, b.y) がコマ内か
                    if (b.x > panel.x && b.x <= panel.x + panel.w &&
                        b.y >= panel.y && b.y < panel.y + panel.h) {
                        bubblesInPanel.push(b);
                        return false; 
                    }
                    return true;
                });
                sortBubblesInPanel(bubblesInPanel);
                bubblesInPanel.forEach((bubble) => {
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


    function importText() {
        const text = prompt('テキストをペーストしてください（現在のページ以降が上書きされます）');
        if (text === null) return; 
        const pagesData = parseTextImport(text);
        if (pagesData.length === 0) return;
        let insertIndex = state.currentPageIndex;
        pagesData.forEach((pageContent, i) => {
            let page;
            if (insertIndex < state.pages.length) {
                page = state.pages[insertIndex];
                // [v13] ページリセット
                page.panels = [createNewPanel(page.frame)];
                page.bubbles = [];
            } else {
                const frame = state.pages[0].frame;
                page = createNewPage(frame);
                state.pages.push(page);
                addPageToDOM(page, insertIndex);
            }
            const frame = page.frame;
            const { w: fw, h: fh } = frame;
            const startX = frame.x + fw - 30; // 右から
            const startY = frame.y + 30; // 上から
            let currentX = startX, currentY = startY;
            pageContent.bubbles.forEach((text) => {
                const bubble = {
                    id: `bubble_import_${Date.now()}`,
                    x: currentX, y: currentY, // 右上アンカー
                    w: 0, h: 0, 
                    text: text, shape: 'ellipse', font: state.defaultFontSize
                };
                measureBubbleSize(bubble);
                page.bubbles.push(bubble);
                currentY += bubble.h + 20; 
                if (currentY > frame.y + fh - 50) { 
                    currentY = startY;
                    currentX -= 120; 
                }
            });
            insertIndex++;
        });
        updatePageIndices();
        resizeAllCanvas();
        setActivePage(Math.min(insertIndex - 1, state.pages.length - 1), true);
        saveState();
    }
    
    function parseTextImport(text) {
        const cleanedText = text.replace(/\r/g, '');
        const pageStrings = cleanedText.split(/\n{3,}/);
        return pageStrings.map(pageStr => {
            const bubbleStrings = pageStr.split(/\n{2,}/).map(s => s.trim()).filter(s => s.length > 0);
            return { bubbles: bubbleStrings };
        });
    }

    // --- 書き出し (PNG / ZIP) ---

    function renderPageToCanvas(page, renderDPR = 2) {
        const baseWidth = 1000; 
        const baseHeight = baseWidth * B5_ASPECT_RATIO;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = baseWidth * renderDPR;
        offCanvas.height = baseHeight * renderDPR;
        const offCtx = offCanvas.getContext('2d');
        offCtx.scale(renderDPR, renderDPR);
        const frame = page.frame; 
        const scaleX = baseWidth / (frame.w + PAGE_FRAME_PADDING * 2);
        const scaleY = baseHeight / (frame.h + PAGE_FRAME_PADDING * 2);
        offCtx.save();
        offCtx.scale(scaleX, scaleY);
        offCtx.fillStyle = 'white';
        offCtx.fillRect(0, 0, offCanvas.width / scaleX / renderDPR, offCanvas.height / scaleY / renderDPR);
        drawPageFrame(page, offCtx);
        drawKoma(page, offCtx, true); // [v13] 修正された描画ロジックで書き出し
        page.bubbles.forEach(bubble => {
            drawSingleBubble(bubble, offCtx); 
        });
        offCtx.restore();
        return offCanvas;
    }

    // [v13] PNG書き出し (Web Share API)
    async function exportPNG() {
        const page = getCurrentPage();
        if (!page) return;
        const offCanvas = renderPageToCanvas(page, state.dpr); 
        const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
        const fileName = `page_${state.currentPageIndex + 1}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Manga Page',
                    text: `Page ${state.currentPageIndex + 1}`,
                    files: [file],
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Share failed:', err);
                    downloadFallback(blob, fileName);
                }
            }
        } else {
            downloadFallback(blob, fileName);
        }
    }
    
    function downloadFallback(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function exportZIP() {
        if (typeof JSZip === 'undefined') {
            alert('ZIPライブラリの読み込みに失敗しました。');
            return;
        }
        const zip = new JSZip();
        for (let i = 0; i < state.pages.length; i++) {
            const page = state.pages[i];
            const offCanvas = renderPageToCanvas(page, 2); 
            const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
            zip.file(`page_${String(i + 1).padStart(3, '0')}.png`, blob);
        }
        zip.generateAsync({ type: 'blob' })
            .then(content => {
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'manganame_v13.zip';
                a.click();
                URL.revokeObjectURL(url);
            });
    }

    // --- 汎用ヘルパー ---
    function saveAndRenderActivePage() {
        saveState();
        renderActivePage();
    }

    // --- 初期化実行 ---
    init();
});