document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 (v6) ---
    const STORAGE_KEY = 'manganame_v6'; // [v6]
    const B5_ASPECT_RATIO = Math.sqrt(2); 
    const PAGE_FRAME_PADDING = 15; 
    const GUTTER_H = 18; 
    const GUTTER_V = 9;  
    const BUBBLE_PADDING_X = 10; 
    const BUBBLE_PADDING_Y = 8;  
    const BUBBLE_LINE_HEIGHT = 1.2; 
    const SNAP_ANGLE_THRESHOLD = 15; 
    const KOMA_TAP_THRESHOLD = 3; // タップとみなす移動距離
    const KOMA_HIT_THRESHOLD = 30; // [v6修正] コマ枠の当たり判定を30pxに拡大

    // --- DOM要素 ---
    const canvasContainer = document.getElementById('canvasContainer');
    
    // ツールバー
    const btnSerif = document.getElementById('btnSerif');
    const btnKoma = document.getElementById('btnKoma');
    const sliderFontSize = document.getElementById('sliderFontSize');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const btnPageAddBefore = document.getElementById('btnPageAddBefore');
    const btnPageAddAfter = document.getElementById('btnPageAddAfter');
    const btnPageDelete = document.getElementById('btnPageDelete');
    const btnCopyText = document.getElementById('btnCopyText');
    const btnPasteText = document.getElementById('btnPasteText');
    const btnPNG = document.getElementById('btnPNG');
    const btnZIP = document.getElementById('btnZIP');
    const btnReset = document.getElementById('btnReset'); 

    // 選択パネル
    const selectionPanelBubble = document.getElementById('selectionPanelBubble');
    const shapeEllipse = document.getElementById('shapeEllipse');
    const shapeRect = document.getElementById('shapeRect');
    const deleteBubble = document.getElementById('deleteBubble');
    const selectionPanelGutter = document.getElementById('selectionPanelGutter');
    const deleteGutter = document.getElementById('deleteGutter');

    // テキスト編集
    const bubbleEditor = document.getElementById('bubbleEditor');
    const textIO = document.getElementById('textIO');
    
    // [v6新設] ページ番号表示
    const pageIndicator = document.getElementById('pageIndicator');


    // --- アプリケーション状態 ---
    let state = {
        pages: [],
        currentPageIndex: 0, 
        currentTool: null, 
        defaultFontSize: 16,
        selectedBubbleId: null,
        selectedGutterId: null, 
        dpr: window.devicePixelRatio || 1,
    };
    
    let pageElements = []; // { wrapper: div, canvas: canvas, ctx: ctx }

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
        resizeAllCanvas(); 
        updateUI();
        setActivePage(state.currentPageIndex, false); 
        updatePageIndicator(); // [v6] 初期表示
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
                state.pages = loadedData.pages || [];
                state.currentPageIndex = loadedData.currentPageIndex || 0;
                state.defaultFontSize = loadedData.defaultFontSize || 16;
                
                if (state.pages.length === 0 || state.currentPageIndex >= state.pages.length) {
                    state.pages = [];
                    state.pages.push(createNewPage());
                    state.currentPageIndex = 0;
                }
            } catch (e) {
                console.error("Failed to load state, initializing:", e);
                state.pages = [];
                state.pages.push(createNewPage());
                state.currentPageIndex = 0;
            }
        } else {
            state.pages = [];
            state.pages.push(createNewPage());
            state.currentPageIndex = 0;
        }
        sliderFontSize.value = state.defaultFontSize;
        fontSizeValue.textContent = `${state.defaultFontSize}px`;
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
            
            page.frame = { 
                x: PAGE_FRAME_PADDING, 
                y: PAGE_FRAME_PADDING, 
                w: frameW, 
                h: frameH 
            };
            
            renderPage(page, el.canvas);
        });
    }

    // --- UI更新 ---
    function updateUI() {
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');

        pageElements.forEach(el => {
            el.canvas.classList.remove('tool-serif', 'tool-koma');
            if (state.currentTool === 'serif') {
                el.canvas.classList.add('tool-serif');
            } else if (state.currentTool === 'koma') {
                el.canvas.classList.add('tool-koma');
            }
        });

        const selectedBubble = getSelectedBubble();
        const selectedGutter = getSelectedGutter();
        
        selectionPanelBubble.classList.toggle('show', !!selectedBubble);
        selectionPanelGutter.classList.toggle('show', !!selectedGutter);
        
        if (!selectedBubble) {
            hideBubbleEditor();
        }
        
        updatePageIndicator(); // [v6] ページ番号を更新
    }

    // [v6新設] ページ番号UIを更新
    function updatePageIndicator() {
        if (pageIndicator) {
            pageIndicator.textContent = `${state.currentPageIndex + 1} / ${state.pages.length}`;
        }
    }

    // --- アクティブページ設定 ---
    function setActivePage(index, scrollToPage = true) {
        if (index < 0 || index >= pageElements.length) return;

        pageElements.forEach(el => {
            el.wrapper.classList.remove('active');
        });
        
        const activeElement = pageElements[index];
        activeElement.wrapper.classList.add('active');
        
        state.currentPageIndex = index;
        updatePageIndicator(); // [v6] アクティブ変更時にページ番号を更新

        if (scrollToPage) {
            activeElement.wrapper.scrollIntoView({
                behavior: 'smooth',
                block: 'center' 
            });
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
        context.lineWidth = 2;
        context.strokeRect(x, y, w, h);
    }

    // [v6修正] コマ枠の延長ロジック (描画時に動的計算)
    function drawKoma(page, context, isExport = false) {
        if (!page.frame) return;

        page.gutters.forEach(gutter => {
            const { dir, pos } = gutter;
            
            // [v6] 描画のたびに、このガターの正しい描画範囲を計算
            const endpoints = calculateGutterEndpoints(page, gutter);
            const { clipMin, clipMax } = endpoints;

            if (clipMin >= clipMax) return; // 描画範囲がない

            if (isExport) {
                // 書き出し時
                const gutterWidth = (dir === 'h') ? GUTTER_H : GUTTER_V;
                const halfGutter = gutterWidth / 2;
                context.fillStyle = 'white';
                if (dir === 'h') {
                    context.fillRect(clipMin, pos - halfGutter, clipMax - clipMin, gutterWidth);
                } else {
                    context.fillRect(pos - halfGutter, clipMin, gutterWidth, clipMax - clipMin);
                }
                context.strokeStyle = 'black';
                context.lineWidth = 1;
                context.beginPath();
                if (dir === 'h') {
                    context.moveTo(clipMin, pos - halfGutter); context.lineTo(clipMax, pos - halfGutter);
                    context.moveTo(clipMin, pos + halfGutter); context.lineTo(clipMax, pos + halfGutter);
                } else {
                    context.moveTo(pos - halfGutter, clipMin); context.lineTo(pos - halfGutter, clipMax);
                    context.moveTo(pos + halfGutter, clipMin); context.lineTo(pos + halfGutter, clipMax);
                }
                context.stroke();
            } else {
                // エディタ上: 黒の「実線」
                context.strokeStyle = 'black';
                context.lineWidth = 1; 
                context.setLineDash([]); 
                context.beginPath();
                if (dir === 'h') {
                    context.moveTo(clipMin, pos);
                    context.lineTo(clipMax, pos);
                } else {
                    context.moveTo(pos, clipMin);
                    context.lineTo(pos, clipMax);
                }
                context.stroke();
            }
        });
    }

    // [v6新設] ガターの描画範囲（始点・終点）を動的に計算する
    function calculateGutterEndpoints(page, gutter) {
        const { dir, pos, bounds } = gutter; // boundsは作成時のコマ
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;
        
        let clipMin, clipMax;
        
        if (dir === 'h') {
            // 水平線 (Yがpos) の、Xの描画範囲 [clipMin, clipMax] を探す
            clipMin = fx;
            clipMax = fx + fw;
            
            // 1. 作成時のコマ(bounds)でクリップ
            clipMin = Math.max(clipMin, bounds.x);
            clipMax = Math.min(clipMax, bounds.x + bounds.w);
            
            // 2. ページ内の全「垂直」ガターをチェック
            page.gutters.forEach(g => {
                if (g.dir === 'v') {
                    // 垂直ガター g が、この水平線 gutter と交差するか？
                    const crossesY = (pos >= g.bounds.y && pos <= g.bounds.y + g.bounds.h);
                    if (crossesY) {
                        if (g.pos > clipMin && g.pos < pos) {
                            // TODO: このロジックはまだ不完全（交差判定がbounds依存）
                        }
                    }
                }
            });
            // [v6] コマ延長ロジック（簡易版）：
            // boundsを無視し、ページ全体で交差する線を探す
            clipMin = fx;
            clipMax = fx + fw;
            page.gutters.forEach(g => {
                if (g.dir === 'v') { // 水平線なので、垂直線を探す
                    // gがこの水平線(pos)と交差するか？ (gのY範囲にposがあるか)
                    if (pos >= g.bounds.y && pos <= g.bounds.y + g.bounds.h) {
                        if (g.pos > clipMin && g.pos <= bounds.x + bounds.w) { // 左の境界
                            clipMin = Math.max(clipMin, g.pos + GUTTER_V / 2);
                        }
                        if (g.pos < clipMax && g.pos >= bounds.x) { // 右の境界
                            clipMax = Math.min(clipMax, g.pos - GUTTER_V / 2);
                        }
                    }
                }
            });
            // boundsで最終クリップ
            clipMin = Math.max(clipMin, bounds.x);
            clipMax = Math.min(clipMax, bounds.x + bounds.w);

        } else {
            // 垂直線 (Xがpos) の、Yの描画範囲 [clipMin, clipMax] を探す
            clipMin = fy;
            clipMax = fy + fh;
            page.gutters.forEach(g => {
                if (g.dir === 'h') { // 垂直線なので、水平線を探す
                    if (pos >= g.bounds.x && pos <= g.bounds.x + g.bounds.w) {
                        if (g.pos > clipMin && g.pos <= bounds.y + bounds.h) { // 上の境界
                            clipMin = Math.max(clipMin, g.pos + GUTTER_H / 2);
                        }
                        if (g.pos < clipMax && g.pos >= bounds.y) { // 下の境界
                            clipMax = Math.min(clipMax, g.pos - GUTTER_H / 2);
                        }
                    }
                }
            });
            clipMin = Math.max(clipMin, bounds.y);
            clipMax = Math.min(clipMax, bounds.y + bounds.h);
        }
        
        return { clipMin, clipMax };
    }


    // [v6修正] ドラッグ中の線も同様のロジックで描画
    function drawDragKomaLine(context, x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page || !page.frame) return;
        
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        
        // [v6] 仮のガターオブジェクトを作成して、描画範囲を計算させる
        const tempGutter = {
            dir,
            pos,
            bounds: findKomaAt(page, x1, y1) // 基準点のコマ
        };
        const { clipMin, clipMax } = calculateGutterEndpoints(page, tempGutter);

        if (clipMin >= clipMax) return;

        context.strokeStyle = '#007bff'; 
        context.lineWidth = 1;
        context.setLineDash([]); 
        context.beginPath();
        if (dir === 'h') {
            context.moveTo(clipMin, pos);
            context.lineTo(clipMax, pos);
        } else {
            context.moveTo(pos, clipMin);
            context.lineTo(pos, clipMax);
        }
        context.stroke();
    }


    function drawBubbles(page, context) {
        page.bubbles.forEach(bubble => {
            if (state.selectedBubbleId === bubble.id && bubbleEditor.style.display === 'block') {
                return;
            }
            drawSingleBubble(bubble, context);
        });
    }

    // [v6修正] フキダシ描画 (右上アンカー)
    function drawSingleBubble(bubble, context) {
        const { x, y, w, h, shape, text, font } = bubble;
        
        context.save();
        context.translate(x, y); // [v6] (x, y) は「右上」

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

        // テキスト描画 (縦書き)
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
        // [v6] フキダシ選択 (右上アンカー)
        const bubble = getSelectedBubble(page);
        if (bubble && bubbleEditor.style.display !== 'block') {
            context.strokeStyle = '#007bff';
            context.lineWidth = 2;
            context.setLineDash([6, 3]);
            context.strokeRect(
                bubble.x - bubble.w - 2, 
                bubble.y - 2, 
                bubble.w + 4, 
                bubble.h + 4
            );
            context.setLineDash([]);
        }
        
        // [v6] コマ枠選択 (延長ロジック適用)
        const gutter = getSelectedGutter(page);
        if(gutter && page.frame) { 
            const { dir, pos } = gutter;
            const { clipMin, clipMax } = calculateGutterEndpoints(page, gutter);

            if (clipMin >= clipMax) return;
            
            context.strokeStyle = '#007bff'; 
            context.lineWidth = 4; 
            context.setLineDash([6, 3]);
            context.beginPath();
            if (dir === 'h') {
                context.moveTo(clipMin, pos);
                context.lineTo(clipMax, pos);
            } else {
                context.moveTo(pos, clipMin);
                context.lineTo(pos, clipMax);
            }
            context.stroke();
            context.setLineDash([]);
        }
    }

    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        window.addEventListener('resize', resizeAllCanvas);
        
        // ツールバー
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
        btnReset.addEventListener('click', resetAllData); 

        // キーボード
        window.addEventListener('keydown', onKeyDown);

        // 選択パネル (フキダシ)
        shapeEllipse.addEventListener('click', () => setBubbleShape('ellipse'));
        shapeRect.addEventListener('click', () => setBubbleShape('rect'));
        deleteBubble.addEventListener('click', deleteSelectedBubble);
        
        // 選択パネル (コマ枠)
        deleteGutter.addEventListener('click', deleteSelectedGutter);

        // テキストエディタ
        bubbleEditor.addEventListener('input', onBubbleEditorInput);
        bubbleEditor.addEventListener('blur', hideBubbleEditor);
        bubbleEditor.addEventListener('keydown', onBubbleEditorKeyDown);
    }
    
    // キャンバス毎のイベントリスナー
    function setupCanvasEventListeners(canvas) {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp); 
    }
    
    // ツール切り替え
    function setTool(toolName) {
        if (state.currentTool === toolName) {
            state.currentTool = null;
        } else {
            state.currentTool = toolName;
        }
        clearSelection();
        updateUI();
        renderActivePage();
    }
    
    // 選択解除
    function clearSelection() {
        state.selectedBubbleId = null;
        state.selectedGutterId = null;
    }

    // アクティブページ（現在選択中のページ）の再描画
    function renderActivePage() {
        const page = getCurrentPage();
        const el = pageElements[state.currentPageIndex];
        if (page && el) {
            renderPage(page, el.canvas);
        }
    }

    // フォントサイズ更新
    function updateFontSize(e) {
        const newSize = parseInt(e.target.value, 10);
        state.defaultFontSize = newSize;
        fontSizeValue.textContent = `${newSize}px`;
        const selectedBubble = getSelectedBubble();
        if (selectedBubble) {
            selectedBubble.font = newSize;
            measureBubbleSize(selectedBubble);
            if (bubbleEditor.style.display === 'block') {
                bubbleEditor.style.fontSize = `${newSize}px`;
                bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
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
        const pageIndex = getPageIndex(e);
        setActivePage(pageIndex, false); 
        
        const { x, y } = getCanvasCoords(e);
        const page = getCurrentPage();
        if (!page) return;

        clearSelection();

        if (state.currentTool === 'serif') {
            const clickedBubble = findBubbleAt(page, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                showBubbleEditor(clickedBubble);
            } else {
                const newBubble = createBubble(x, y);
                state.selectedBubbleId = newBubble.id;
                showBubbleEditor(newBubble);
            }
        } else if (state.currentTool === 'koma') {
            const clickedGutter = findGutterAt(page, x, y);
            if (clickedGutter) {
                state.selectedGutterId = clickedGutter.id;
            } else {
                isDragging = true;
                dragStartX = x; dragStartY = y;
                dragCurrentX = x; dragCurrentY = y;
            }
        } else {
            // 選択モード (ツールがnull)
            const clickedBubble = findBubbleAt(page, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                isDraggingBubble = true;
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
                // [v6] ドラッグ開始時にスクロールを無効化
                e.target.classList.add('dragging');
            }
        }
        
        updateUI();
        renderActivePage();
    }

    function onPointerMove(e) {
        // [v6] ドラッグ中はスクロールを止める (touch-action が効かない場合のための保険)
        if (isDragging || isDraggingBubble) {
            e.preventDefault();
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
        if (isDragging && state.currentTool === 'koma') {
            isDragging = false;
            const { x, y } = getCanvasCoords(e);
            addKomaLine(dragStartX, dragStartY, x, y);
            saveAndRenderActivePage();
        } else if (isDraggingBubble) {
            isDraggingBubble = false;
            // [v6] ドラッグ終了時にスクロールを有効化
            e.target.classList.remove('dragging');
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

    function createNewPage() {
        const id = `page_${Date.now()}`;
        const page = { id: id, frame: null, gutters: [], bubbles: [] };
        const cssWidth = pageElements.length > 0 ? pageElements[0].canvas.clientWidth : 300; 
        const cssHeight = cssWidth * B5_ASPECT_RATIO;
        page.frame = { 
            x: PAGE_FRAME_PADDING, y: PAGE_FRAME_PADDING, 
            w: cssWidth - PAGE_FRAME_PADDING * 2, h: cssHeight - PAGE_FRAME_PADDING * 2 
        };
        return page;
    }

    function addPage(before = false) {
        const newPage = createNewPage();
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
            state.pages[0] = createNewPage();
            clearSelection();
            saveAndRenderActivePage();
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
        updatePageIndicator(); // [v6] ページ総数が変わるので更新
    }

    function resetAllData() {
        if (confirm("本当にリセットしますか？\nすべてのページとデータが消去されます。")) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    }

    // --- セリフ (フキダシ) ロジック ---
    // [v6修正] フキダシ作成 (右上アンカー)
    function createBubble(x, y) {
        const page = getCurrentPage();
        if (!page) return null; 
        const bubble = {
            id: `bubble_${Date.now()}`,
            x: x, y: y, // [v6] (x, y) は「右上」
            w: 100, h: 50, 
            text: "セリフ",
            shape: 'ellipse',
            font: state.defaultFontSize
        };
        measureBubbleSize(bubble); 
        page.bubbles.push(bubble);
        return bubble;
    }

    // [v6修正] フキダシ当たり判定 (右上アンカー)
    function findBubbleAt(page, x, y) {
        if (!page) return null;
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
        bubbleEditor.select();
        updateUI();
        renderActivePage();
    }
    
    // [v6修正] エディタ位置 (右上アンカー)
    function updateBubbleEditorPosition(bubble) {
        const canvas = pageElements[state.currentPageIndex].canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const containerScrollTop = canvasContainer.scrollTop;
        const editorWidth = bubble.w;
        const editorHeight = bubble.h;
        bubbleEditor.style.width = `${editorWidth}px`;
        bubbleEditor.style.height = `${editorHeight}px`;
        bubbleEditor.style.left = `${canvasRect.left + bubble.x - editorWidth}px`; // (x - w)
        bubbleEditor.style.top = `${canvasRect.top + containerScrollTop + bubble.y}px`; // (y)
    }

    function hideBubbleEditor() {
        if (bubbleEditor.style.display === 'block') {
            bubbleEditor.style.display = 'none';
            const bubble = getSelectedBubble();
            if (bubble) {
                if (bubble.text.trim() === "") {
                    deleteSelectedBubble(); 
                    state.selectedBubbleId = null;
                } else {
                    saveAndRenderActivePage();
                }
            }
        }
    }

    function onBubbleEditorInput(e) {
        const bubble = getSelectedBubble();
        if (bubble) {
            bubble.text = e.target.value;
            measureBubbleSize(bubble);
            updateBubbleEditorPosition(bubble);
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
        if (maxHeight === 0 && lines.length > 0) maxHeight = charHeight;
        else if (maxHeight === 0) maxHeight = font; 
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

    // --- コマ割りロジック ---

    // [v6修正] どのコマに属するか（bounds）を再帰的に計算
    function findKomaAt(page, x, y) {
        let currentBounds = page.frame;
        if (!currentBounds) return { x: 0, y: 0, w: 0, h: 0 };
        
        let foundSplit = true;
        while(foundSplit) {
            foundSplit = false;
            for(const gutter of page.gutters) {
                const { dir, pos, bounds: gutterBounds } = gutter;
                
                // このガターが現在のboundsを分割するか？
                const intersects = !(gutterBounds.x > currentBounds.x + currentBounds.w ||
                                   gutterBounds.x + gutterBounds.w < currentBounds.x ||
                                   gutterBounds.y > currentBounds.y + currentBounds.h ||
                                   gutterBounds.y + gutterBounds.h < currentBounds.y);

                if (intersects) {
                    if (dir === 'h' && y >= gutterBounds.y && y <= gutterBounds.y + gutterBounds.h) {
                        if (y > pos && pos > currentBounds.y) { // 下
                            const newY = pos + GUTTER_H / 2;
                            currentBounds = { x: currentBounds.x, y: newY, w: currentBounds.w, h: (currentBounds.y + currentBounds.h) - newY };
                            foundSplit = true;
                        } else if (y <= pos && pos < currentBounds.y + currentBounds.h) { // 上
                            currentBounds = { x: currentBounds.x, y: currentBounds.y, w: currentBounds.w, h: (pos - GUTTER_H / 2) - currentBounds.y };
                            foundSplit = true;
                        }
                    } else if (dir === 'v' && x >= gutterBounds.x && x <= gutterBounds.x + gutterBounds.w) {
                        if (x > pos && pos > currentBounds.x) { // 右
                            const newX = pos + GUTTER_V / 2;
                            currentBounds = { x: newX, y: currentBounds.y, w: (currentBounds.x + currentBounds.w) - newX, h: currentBounds.h };
                            foundSplit = true;
                        } else if (x <= pos && pos < currentBounds.x + currentBounds.w) { // 左
                            currentBounds = { x: currentBounds.x, y: currentBounds.y, w: (pos - GUTTER_V / 2) - currentBounds.x, h: currentBounds.h };
                            foundSplit = true;
                        }
                    }
                }
            }
        }
        // 最終的なboundsをクリッピング
        currentBounds.w = Math.min(currentBounds.x + currentBounds.w, page.frame.x + page.frame.w) - currentBounds.x;
        currentBounds.h = Math.min(currentBounds.y + currentBounds.h, page.frame.y + page.frame.h) - currentBounds.y;
        
        return currentBounds;
    }


    // [v6修正] タップ（水平線）判定
    function getKomaSnapDirection(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);

        if (dist < KOMA_TAP_THRESHOLD) {
            return { dir: 'h', pos: y1 }; // タップは水平
        }
        
        const angle = Math.atan2(dy, dx) * 180 / Math.PI; 
        let dir = null;
        let pos = 0;
        if (Math.abs(angle) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle) >= 180 - SNAP_ANGLE_THRESHOLD) {
            dir = 'h'; pos = y1; 
        } else if (Math.abs(angle - 90) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle + 90) <= SNAP_ANGLE_THRESHOLD) {
            dir = 'v'; pos = x1; 
        } else {
            dir = (Math.abs(dx) > Math.abs(dy)) ? 'h' : 'v';
            pos = (dir === 'h') ? y1 : x1;
        }
        return { dir, pos };
    }

    function addKomaLine(x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        // [v6] 作成時のboundsを、新しいfindKomaAtで正しく取得
        const komaBounds = findKomaAt(page, x1, y1);
        page.gutters.push({
            id: `gutter_${Date.now()}`, 
            dir: dir, pos: pos, bounds: komaBounds 
        });
    }

    // [v6修正] 当たり判定を拡大
    function findGutterAt(page, x, y) {
        if (!page) return null;
        for (let i = page.gutters.length - 1; i >= 0; i--) {
            const gutter = page.gutters[i];
            const { dir, pos, bounds } = gutter;
            // [v6] boundsを無視し、計算し直した描画範囲で当たり判定
            const { clipMin, clipMax } = calculateGutterEndpoints(page, gutter);
            
            if (dir === 'h' && y >= pos - KOMA_HIT_THRESHOLD && y <= pos + KOMA_HIT_THRESHOLD) {
                if (x >= clipMin && x <= clipMax) return gutter;
            }
            if (dir === 'v' && x >= pos - KOMA_HIT_THRESHOLD && x <= pos + KOMA_HIT_THRESHOLD) {
                if (y >= clipMin && y <= clipMax) return gutter;
            }
        }
        return null;
    }

    function getSelectedGutter(page = getCurrentPage()) {
        if (!page || !state.selectedGutterId) return null;
        return page.gutters.find(g => g.id === state.selectedGutterId);
    }
    
    function deleteSelectedGutter() {
        const page = getCurrentPage();
        if (!page || !state.selectedGutterId) return;
        page.gutters = page.gutters.filter(g => g.id !== state.selectedGutterId);
        state.selectedGutterId = null;
        updateUI();
        saveAndRenderActivePage();
    }


    // --- [v6新設] テキストコピー（コマ順ソート） ---
    
    // ページから全コマの矩形を計算する
    function findPanels(page) {
        if (!page.frame) return [];
        let panels = [page.frame]; // スタートはページ全体
        
        // ガターで再帰的にコマを分割
        function splitPanel(panel, gutters) {
            for (const gutter of gutters) {
                const { dir, pos } = gutter;
                
                // ガターがパネルを分割するか？
                if (dir === 'h' && pos > panel.y && pos < panel.y + panel.h) {
                    // 水平分割
                    const p1 = { x: panel.x, y: panel.y, w: panel.w, h: (pos - GUTTER_H / 2) - panel.y };
                    const p2 = { x: panel.x, y: pos + GUTTER_H / 2, w: panel.w, h: (panel.y + panel.h) - (pos + GUTTER_H / 2) };
                    return [...splitPanel(p1, gutters), ...splitPanel(p2, gutters)];
                }
                if (dir === 'v' && pos > panel.x && pos < panel.x + panel.w) {
                    // 垂直分割
                    const p1 = { x: panel.x, y: panel.y, w: (pos - GUTTER_V / 2) - panel.x, h: panel.h };
                    const p2 = { x: pos + GUTTER_V / 2, y: panel.y, w: (panel.x + panel.w) - (pos + GUTTER_V / 2), h: panel.h };
                    return [...splitPanel(p1, gutters), ...splitPanel(p2, gutters)];
                }
            }
            return [panel]; // 分割するガターがなかった
        }

        // 簡易版：v5のfindKomaAt(sampling)ベース
        const knownBounds = new Set();
        let finalPanels = [];
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;
        for(let y = fy + 1; y < fy + fh; y += (fh / 10)) {
            for(let x = fx + 1; x < fx + fw; x += (fw / 10)) {
                const bounds = findKomaAt(page, x, y);
                const key = `${bounds.x},${bounds.y},${bounds.w},${bounds.h}`;
                if (!knownBounds.has(key)) {
                    knownBounds.add(key);
                    finalPanels.push(bounds);
                }
            }
        }

        // コマを漫画の読み順（上→下、右→左）でソート
        finalPanels.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 10) { 
                return b.x - a.x; // 右 (X大) が先
            }
            return a.y - b.y; // 上 (Y小) が先
        });
        
        return finalPanels;
    }
    
    // [v6] コマ内のフキダシをソート（右優先→上優先）
    function sortBubblesInPanel(bubbles) {
        return bubbles.sort((a, b) => {
            // [v6] 座標は右上アンカー (b.x, b.y)
            if (Math.abs(a.x - b.x) < 10) { // ほぼ同じX
                return a.y - b.y; // 上 (Y小) が先
            }
            return b.x - a.x; // 右 (X大) が先
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
                    // [v6] 右上アンカー (b.x, b.y) がコマ内か
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
                page.bubbles = [];
            } else {
                page = createNewPage();
                state.pages.push(page);
                addPageToDOM(page, insertIndex);
            }
            
            const frame = page.frame || { x: PAGE_FRAME_PADDING, y: PAGE_FRAME_PADDING, w: 200, h: 280 };
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
                
                currentY += bubble.h + 20; // 次は下へ
                if (currentY > frame.y + fh - 50) { // 50pxは最低マージン
                    currentY = startY;
                    currentX -= 120; // 次の列（左）へ
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
        drawKoma(page, offCtx, true); // 書き出しモード
        page.bubbles.forEach(bubble => {
            drawSingleBubble(bubble, offCtx); 
        });
        offCtx.restore();
        return offCanvas;
    }

    // [v6修正] PNG書き出し (Web Share API)
    async function exportPNG() {
        const page = getCurrentPage();
        if (!page) return;
        
        const offCanvas = renderPageToCanvas(page, state.dpr); 
        const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
        const fileName = `page_${state.currentPageIndex + 1}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // Web Share API (スマホの「共有」機能) を試す
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Manga Page',
                    text: `Page ${state.currentPageIndex + 1}`,
                    files: [file],
                });
                // 共有が成功（「画像を保存」などが選ばれた）
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Share failed:', err);
                    // 共有が失敗したらフォールバック
                    downloadFallback(blob, fileName);
                }
            }
        } else {
            // 共有APIが使えない（PCなど）場合は、従来のダウンロード
            downloadFallback(blob, fileName);
        }
    }
    
    // [v6新設] ダウンロードのフォールバック
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
                a.download = 'manganame_v6.zip';
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