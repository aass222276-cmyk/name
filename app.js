// [修正済] Canvas描画時に90度回転させる記号リスト
const ROTATE_CHARS = new Set([
    '(', ')', '-', '=', '?', '!', '「', '」', '（', '）', 'ー', '？', '！', 
    '【', '】', '～', '＝', '＆', '。', '、', '…'
]);


document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 ---
    const STORAGE_KEY = 'manganame-v15-draw'; // [修正] バージョンアップ
    const B5_ASPECT_RATIO = Math.sqrt(2); 
    const PAGE_FRAME_PADDING = 15; 
    const GUTTER_H = 18; 
    const GUTTER_V = 9;  
    const BUBBLE_PADDING_X = 10; 
    const BUBBLE_PADDING_Y = 8;  
    const BUBBLE_PADDING_NONE = 2; 
    const BUBBLE_LINE_HEIGHT = 1.2; 
    const SNAP_ANGLE_THRESHOLD = 15; 
    const KOMA_TAP_THRESHOLD = 3; 
    const CHARS_PER_COLUMN = 12;
    // ======[修正箇所 (描画定数)]======
    const CANVAS_BG_COLOR = '#FFFFFF'; // [修正] 描画キャンバスの背景色 (白)
    // ======[修正ここまで]======


    // --- DOM要素 ---
    const canvasContainer = document.getElementById('canvasContainer');
    const btnSerif = document.getElementById('btnSerif');
    const btnKoma = document.getElementById('btnKoma');
    const sliderFontSize = document.getElementById('sliderFontSize');
    const fontSizeValueDisplay = document.getElementById('fontSizeValueDisplay'); 
    const fontSliderPanel = document.getElementById('fontSliderPanel'); 
    const btnPageAddBefore = document.getElementById('btnPageAddBefore');
    const btnPageAddAfter = document.getElementById('btnPageAddAfter');
    const btnPageDelete = document.getElementById('btnPageDelete');
    const btnCopyText = document.getElementById('btnCopyText');
    const btnPasteText = document.getElementById('btnPasteText');
    const btnPNG = document.getElementById('btnPNG');
    const btnZIP = document.getElementById('btnZIP');
    const btnResetPanels = document.getElementById('btnResetPanels'); 
    const btnResetBubbles = document.getElementById('btnResetBubbles'); 
    const btnResetAllEl = document.getElementById('btnReset');
    const toolResetPanel = document.getElementById('toolResetPanel'); 
    const selectionPanelBubble = document.getElementById('selectionPanelBubble');
    const shapeEllipse = document.getElementById('shapeEllipse');
    const shapeRect = document.getElementById('shapeRect');
    const shapeNone = document.getElementById('shapeNone'); 
    const deleteBubble = document.getElementById('deleteBubble');
    const bubbleEditor = document.getElementById('bubbleEditor');
    const textIO = document.getElementById('textIO');
    const pageIndicator = document.getElementById('pageIndicator');
    const scrollLockBtn = document.getElementById('scrollLockBtn'); 

    // ======[修正箇所 (描画UI)]======
    const btnDraw = document.getElementById('btnDraw'); // 描画ボタン
    const lineWidthSliderPanel = document.getElementById('lineWidthSliderPanel');
    const sliderLineWidth = document.getElementById('sliderLineWidth');
    const lineWidthValueDisplay = document.getElementById('lineWidthValueDisplay');
    const selectionPanelDraw = document.getElementById('selectionPanelDraw');
    const btnPen = document.getElementById('btnPen');
    const btnEraser = document.getElementById('btnEraser');
    const btnResetDrawing = document.getElementById('btnResetDrawing');
    // ======[修正ここまで]======

    // --- アプリケーション状態 ---
    let state = {
        pages: [], // [修正] { id, frame, panels: [], bubbles: [], drawingData: null }
        currentPageIndex: 0, 
        currentTool: null, // 'serif', 'koma', 'draw', または null
        defaultFontSize: 16,
        selectedBubbleId: null,
        dpr: window.devicePixelRatio || 1,
        isScrollLocked: false, 
        // ======[修正箇所 (描画状態)]======
        currentDrawTool: 'pen', // 'pen' or 'eraser'
        currentLineWidth: 5,
        eraserWidth: 30,
        // ======[修正ここまで]======
    };
    
    let pageElements = []; // [修正] { wrapper, mainCanvas, mainCtx, drawingCanvas, drawingCtx }
    let activePointerId = null; 

    // ドラッグ状態
    let isDragging = false; // コマ枠用
    let isDraggingBubble = false; // フキダシドラッグ用
    let dragStartX = 0, dragStartY = 0;
    let dragCurrentX = 0, dragCurrentY = 0;
    let dragBubbleOffsetX = 0, dragBubbleOffsetY = 0; 
    
    // ======[修正箇所 (描画ドラッグ状態)]======
    let isDrawingOnCanvas = false;
    // ======[修正ここまで]======
    
    // スクロールロック状態（手動トグル用）
    let __scrollLocked = false;
    let __scrollLockY = 0;

    // --- スクロールロック (v15: "手動" solution) (変更なし) ---
    function toggleScrollLock() {
        state.isScrollLocked = !state.isScrollLocked;
        if (state.isScrollLocked) {
            __scrollLockY = window.scrollY || 0;
            document.body.style.position = 'fixed';
            document.body.style.top = (-__scrollLockY) + 'px';
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.width = '100%';
            canvasContainer.classList.add('scroll-locked');
            scrollLockBtn.classList.add('active');
        } else {
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            document.body.style.width = '';
            canvasContainer.classList.remove('scroll-locked');
            scrollLockBtn.classList.remove('active');
            window.scrollTo(0, __scrollLockY);
        }
    }

    // --- 自動スクロールロック（ドラッグ中だけ）(変更なし) ---
    let __autoScrollLocked = false;
    let __autoScrollY = 0;

    function beginAutoScrollLock(){
      if (state.isScrollLocked || __autoScrollLocked) return;
      __autoScrollLocked = true;
      __autoScrollY = window.scrollY || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = (-__autoScrollY) + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      canvasContainer.classList.add('scroll-locked');
    }

    function endAutoScrollLock(){
      if (!__autoScrollLocked) return;
      __autoScrollLocked = false;
      if (!state.isScrollLocked){
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        canvasContainer.classList.remove('scroll-locked');
        window.scrollTo(0, __autoScrollY);
      }
    }


    // --- 初期化 ---
    function init() {
        registerServiceWorker();
        loadState();
        setupEventListeners();
        createPageDOMElements();
        
        requestAnimationFrame(() => {
            resizeAllCanvas(); 
            updateUI();
            setActivePage(state.currentPageIndex, false); 
            updatePageIndicator(); 
            // [修正] 最初のページの描画コンテキストを初期化
            applyDrawingContextSettings(pageElements[state.currentPageIndex].drawingCtx);
        });
    }

    // --- PWA (Service Worker) (変更なし) ---
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
            // [修正] 描画データも保存
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
                // [修正] drawingData があるかチェック (互換性のため)
                if (loadedData.pages && loadedData.pages[0] && loadedData.pages[0].panels) {
                    state.pages = loadedData.pages || [];
                    state.currentPageIndex = loadedData.currentPageIndex || 0;
                    state.defaultFontSize = loadedData.defaultFontSize || 16;
                    
                    // [修正] 古いデータに drawingData を追加
                    state.pages.forEach(page => {
                        if (typeof page.drawingData === 'undefined') {
                            page.drawingData = null;
                        }
                    });
                } else {
                    throw new Error("Old data structure. Resetting.");
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
        fontSizeValueDisplay.innerHTML = `${state.defaultFontSize}px`;
        // [修正] 線幅スライダーも初期化
        sliderLineWidth.value = state.currentLineWidth;
        lineWidthValueDisplay.innerHTML = `${state.currentLineWidth}px`;
    }
    
    
    function initNewState() {
        state.pages = [];
        state.pages.push(createNewPage(null)); // frameはnullで初期化
        state.currentPageIndex = 0;
    }

    // ======[修正箇所 (ページDOM生成)]======
    // [修正] 2枚のCanvasを生成
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
        
        // (1) 奥の描画キャンバス (z-index 1)
        const drawingCanvas = document.createElement('canvas');
        drawingCanvas.className = 'drawingCanvas pointer-none'; // 最初はタップ無効
        drawingCanvas.dataset.pageIndex = index; 
        const drawingCtx = drawingCanvas.getContext('2d');

        // (2) 手前のUIキャンバス (z-index 2)
        const mainCanvas = document.createElement('canvas');
        mainCanvas.className = 'mainCanvas';
        mainCanvas.dataset.pageIndex = index; 
        const mainCtx = mainCanvas.getContext('2d');
        
        wrapper.appendChild(drawingCanvas);
        wrapper.appendChild(mainCanvas);

        const elementRef = { wrapper, mainCanvas, mainCtx, drawingCanvas, drawingCtx };

        if (index >= pageElements.length) {
            canvasContainer.appendChild(wrapper);
            pageElements.push(elementRef);
        } else {
            const nextElement = pageElements[index];
            canvasContainer.insertBefore(wrapper, nextElement.wrapper);
            pageElements.splice(index, 0, elementRef);
        }
        
        // (3) 両方のCanvasにイベントリスナーを設定
        setupCanvasEventListeners(elementRef);
        return elementRef;
    }
    // ======[修正ここまで]======


    // ======[修正箇所 (キャンバスリサイズ)]======
    // [修正] 2枚のCanvasのリサイズと描画復元
    function resizeAllCanvas() {
        state.dpr = window.devicePixelRatio || 1;
        if (pageElements.length === 0) return;
        const firstWrapper = pageElements[0].wrapper;
        if (!firstWrapper.clientWidth) {
            setTimeout(resizeAllCanvas, 50);
            return;
        }
        const cssWidth = firstWrapper.clientWidth;
        const cssHeight = firstWrapper.clientHeight; // wrapper の aspect-ratio から高さを取得
        
        const canvasWidth = Math.round(cssWidth * state.dpr);
        const canvasHeight = Math.round(cssHeight * state.dpr);
        
        const frameW = cssWidth - PAGE_FRAME_PADDING * 2;
        const frameH = cssHeight - PAGE_FRAME_PADDING * 2;
        
        // [重要] リサイズ前に、現在の描画を保存 (アクティブページのみ)
        if (pageElements[state.currentPageIndex]) {
            saveCurrentDrawing(state.currentPageIndex);
        }

        pageElements.forEach((el, index) => {
            const page = state.pages[index];
            if (!page) return;
            
            // 両方のCanvasのサイズを設定
            [el.mainCanvas, el.drawingCanvas].forEach(canvas => {
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
            });
            
            // 両方のContextのスケールを設定
            el.mainCtx.scale(state.dpr, state.dpr);
            el.drawingCtx.scale(state.dpr, state.dpr);
            
            // --- UIレイヤー (mainCtx) の座標スケーリング ---
            const oldFrame = page.frame;
            const newFrame = { 
                x: PAGE_FRAME_PADDING, y: PAGE_FRAME_PADDING, 
                w: frameW, h: frameH 
            };
            page.frame = newFrame;
            
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
                });
            } else if (page.panels.length === 0) {
                page.panels = [createNewPanel(page.frame)];
            }
            
            // --- 描画レイヤー (drawingCtx) の復元 ---
            // [重要] リサイズで消えた描画を復元
            // ただし、全ページ復元すると重いので、アクティブなページだけ復元
            if (index === state.currentPageIndex) {
                loadDrawing(index);
            }
            
            // UIレイヤーの再描画
            renderPage(page, el.mainCanvas);
        });
    }
    // ======[修正ここまで]======


    // ======[修正箇所 (UI更新)]======
    function updateUI() {
        // ツールバーのボタン状態
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');
        btnDraw.classList.toggle('active', state.currentTool === 'draw');
        
        // キャンバスのカーソル状態 (mainCanvas のみ)
        pageElements.forEach(el => {
            el.mainCanvas.classList.remove('tool-serif', 'tool-koma');
            if (state.currentTool === 'serif') el.mainCanvas.classList.add('tool-serif');
            else if (state.currentTool === 'koma') el.mainCanvas.classList.add('tool-koma');
        });

        const selectedBubble = getSelectedBubble();

        // ツールリセットパネル
        const showResetKoma = (state.currentTool === 'koma');
        const showResetSerif = (state.currentTool === 'serif');
        const showResetDraw = (state.currentTool === 'draw');
        
        btnResetPanels.classList.toggle('show', showResetKoma);
        btnResetBubbles.classList.toggle('show', showResetSerif);
        btnResetDrawing.classList.toggle('show', showResetDraw);
        
        toolResetPanel.classList.toggle('show', showResetKoma || showResetSerif || showResetDraw);

        // セリフ選択パネル
        selectionPanelBubble.classList.toggle('show', !!selectedBubble && state.currentTool !== 'draw');
        
        // 描画ツールパネル
        selectionPanelDraw.classList.toggle('show', state.currentTool === 'draw');

        // フォントスライダーパネル
        const showFontSlider = (state.currentTool === 'serif') || (state.currentTool === null && !!selectedBubble);
        fontSliderPanel.classList.toggle('show', showFontSlider);

        // 線幅スライダーパネル
        lineWidthSliderPanel.classList.toggle('show', state.currentTool === 'draw');

        
        if (!selectedBubble) hideBubbleEditor();
        updatePageIndicator(); 
    }
    // ======[修正ここまで]======


    function updatePageIndicator() {
        if (pageIndicator) {
            pageIndicator.textContent = `${state.currentPageIndex + 1} / ${state.pages.length}`;
        }
    }

    // ======[修正箇所 (ページ切り替え)]======
    // [大手術] ページ切り替え（描画の保存/復元）
    function setActivePage(index, scrollToPage = true) {
        if (index < 0 || index >= pageElements.length) return;
        
        const oldIndex = state.currentPageIndex;
        
        // (1) [保存] ページを離れる前に、現在の描画を保存
        if (oldIndex !== index && pageElements[oldIndex]) {
            saveCurrentDrawing(oldIndex);
        }

        // (2) [アクティブ化] UI（ハイライト）を切り替え
        pageElements.forEach(el => el.wrapper.classList.remove('active'));
        const activeElement = pageElements[index];
        activeElement.wrapper.classList.add('active');
        state.currentPageIndex = index;
        
        // (3) [復元] 新しいページの描画を読み込む
        loadDrawing(index);

        updatePageIndicator(); 
        if (scrollToPage && !state.isScrollLocked) { 
            activeElement.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    // ======[修正ここまで]======


    // ======[修正箇所 (描画ロジック)]======
    // [修正] renderPage は UIレイヤー (mainCanvas) のみ描画
    function renderPage(page, canvas) {
        if (!page || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx || !page.frame) return;
        
        const cssWidth = canvas.clientWidth;
        const cssHeight = canvas.clientHeight;
        
        ctx.save();
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        
        // [最重要] 背景の白塗りつぶしを「削除」
        // ctx.fillStyle = 'white';
        // ctx.fillRect(0, 0, cssWidth, cssHeight);
        
        // [修正] 透明なキャンバスに描画するため、clearRectする
        ctx.clearRect(0, 0, cssWidth, cssHeight);

        drawPageFrame(page, ctx);
        drawKoma(page, ctx, false); // ガイド線モード
        drawBubbles(page, ctx);
        drawSelection(page, ctx);
        
        // コマ割りドラッグ中の線（変更なし）
        if (state.currentPageIndex === state.pages.indexOf(page)) {
            if (isDragging && state.currentTool === 'koma') {
                drawDragKomaLine(ctx, dragStartX, dragStartY, dragCurrentX, dragCurrentY);
            }
        }
        ctx.restore();
    }
    // ======[修正ここまで]======

    
    // --- 既存の描画関数 (変更なし) ---
    function drawPageFrame(page, context) {
        if (!page.frame) return;
        const { x, y, w, h } = page.frame;
        context.strokeStyle = 'black';
        context.lineWidth = 2; 
        context.strokeRect(x, y, w, h);
    }
    function drawKoma(page, context, isExport = false) {
        if (!page.frame) return;
        page.panels.forEach(panel => {
            context.strokeStyle = 'black';
            context.lineWidth = 2; 
            context.setLineDash([]); 
            context.strokeRect(panel.x, panel.y, panel.w, panel.h);
        });
    }
    function drawDragKomaLine(context, x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page || !page.frame) return;
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        const panel = findPanelAt(page, x1, y1);
        if (!panel) return;
        const clipMinX = panel.x;
        const clipMaxX = panel.x + panel.w;
        const clipMinY = panel.y;
        const clipMaxY = panel.y + panel.h;
        context.strokeStyle = '#007bff'; 
        context.lineWidth = 1;
        context.setLineDash([4, 2]); 
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
        page.bubbles.forEach(bubble => {
            if (state.selectedBubbleId === bubble.id && bubbleEditor.style.display === 'block') {
                return;
            }
            drawSingleBubble(bubble, context);
        });
    }
    // [修正済] 12文字折り返し + 記号回転
    function drawSingleBubble(bubble, context) {
        const { x, y, w, h, shape, text, font } = bubble;
        context.save();
        context.translate(x, y); // (x, y) は「右上」
        context.fillStyle = 'white'; // フキダシは白で塗りつぶす
        context.strokeStyle = 'black';
        context.lineWidth = 2;
        context.beginPath();
        switch (shape) {
            case 'rect':
            case 'none': 
                context.rect(-w, 0, w, h);
                break;
            case 'ellipse':
            default:
                context.ellipse(-w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
                break;
        }
        context.closePath();
        context.fill(); // フキダシの背景は白で塗る
        if (shape !== 'none') { 
            context.stroke();
        }
        context.fillStyle = 'black';
        context.font = `${font}px 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif`;
        context.textAlign = 'center'; 
        context.textBaseline = 'middle';

        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; 
        const charHeight = font * BUBBLE_LINE_HEIGHT;  
        const paddingX = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_X;
        const paddingY = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_Y;
        let currentX = -paddingX - (columnWidth / 2);
        const startY = paddingY + (charHeight * 0.9) / 2;

        lines.forEach((line) => {
            let currentY = startY;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (i > 0 && i % CHARS_PER_COLUMN === 0) {
                    currentY = startY;   
                    currentX -= columnWidth; 
                }
                if (ROTATE_CHARS.has(char)) {
                    context.save();
                    context.translate(currentX, currentY);
                    context.rotate(Math.PI / 2);
                    context.fillText(char, 0, 0); 
                    context.restore();
                } else {
                    context.fillText(char, currentX, currentY);
                }
                currentY += charHeight * 0.9; 
            }
            currentX -= columnWidth; 
        });
        context.restore();
    }
    function drawSelection(page, context) {
        const bubble = getSelectedBubble(page);
        if (bubble && bubbleEditor.style.display !== 'block') {
            context.strokeStyle = '#007bff';
            context.lineWidth = 2;
            context.setLineDash([6, 3]);
            context.strokeRect(bubble.x - bubble.w - 2, bubble.y - 2, bubble.w + 4, bubble.h + 4);
            context.setLineDash([]);
        }
    }
    // --- 既存の描画関数 (ここまで) ---


    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        window.addEventListener('resize', resizeAllCanvas);
        
        // ツールバー
        btnSerif.addEventListener('click', () => setTool('serif'));
        btnKoma.addEventListener('click', () => setTool('koma'));
        btnDraw.addEventListener('click', () => setTool('draw')); // [修正] 描画ツール
        
        // フォントスライダー
        sliderFontSize.addEventListener('input', handleSliderChange); 
        fontSizeValueDisplay.addEventListener('click', onChangeFontSizeByInput); 

        // ======[修正箇所 (線幅スライダー)]======
        sliderLineWidth.addEventListener('input', handleLineWidthSliderChange);
        lineWidthValueDisplay.addEventListener('click', onChangeLineWidthByInput);
        // ======[修正ここまで]======
        
        // ページ操作
        btnPageAddBefore.addEventListener('click', () => addPage(true));
        btnPageAddAfter.addEventListener('click', () => addPage(false));
        btnPageDelete.addEventListener('click', deletePage);
        
        // 入出力
        btnCopyText.addEventListener('click', exportText);
        btnPasteText.addEventListener('click', importText);
        btnPNG.addEventListener('click', exportPNG);
        btnZIP.addEventListener('click', exportZIP);
        
        // リセット系
        btnResetPanels.addEventListener('click', resetCurrentPagePanels); 
        btnResetBubbles.addEventListener('click', resetCurrentPageBubbles); 
        btnResetDrawing.addEventListener('click', resetCurrentPageDrawing); // [修正] 描画リセット
        btnResetAllEl.addEventListener('click', resetAllData); 
        
        // フキダシ編集
        shapeEllipse.addEventListener('click', () => setBubbleShape('ellipse'));
        shapeRect.addEventListener('click', () => setBubbleShape('rect'));
        shapeNone.addEventListener('click', () => setBubbleShape('none')); 
        deleteBubble.addEventListener('click', deleteSelectedBubble);
        
        // ======[修正箇所 (描画ツール)]======
        btnPen.addEventListener('click', () => setDrawTool('pen'));
        btnEraser.addEventListener('click', () => setDrawTool('eraser'));
        // ======[修正ここまで]======
        
        // その他
        bubbleEditor.addEventListener('input', onBubbleEditorInput);
        bubbleEditor.addEventListener('blur', hideBubbleEditor);
        bubbleEditor.addEventListener('keydown', onBubbleEditorKeyDown);
        window.addEventListener('keydown', onKeyDown);
        scrollLockBtn.addEventListener('click', toggleScrollLock);
        
        setupZoomPrevention();
    }
    
    // (変更なし)
    function setupZoomPrevention() {
        document.addEventListener('touchmove', function(event) {
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        }, { passive: false }); 
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(event) {
            if (event.touches.length > 0) return; 
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false }); 
    }
    
    // ======[修正箇所 (2枚のCanvasへのイベント設定)]======
    function setupCanvasEventListeners(pageElement) {
        // UIレイヤー (フキダシ/コマ枠) のイベント
        pageElement.mainCanvas.addEventListener('pointerdown', onPointerDown);
        pageElement.mainCanvas.addEventListener('pointermove', onPointerMove, { passive: false }); 
        pageElement.mainCanvas.addEventListener('pointerup', onPointerUp);
        pageElement.mainCanvas.addEventListener('pointercancel', onPointerCancel); 
        
        // 描画レイヤーのイベント
        pageElement.drawingCanvas.addEventListener('pointerdown', onDrawingPointerDown);
        pageElement.drawingCanvas.addEventListener('pointermove', onDrawingPointerMove, { passive: false });
        pageElement.drawingCanvas.addEventListener('pointerup', onDrawingPointerUp);
        pageElement.drawingCanvas.addEventListener('pointercancel', onDrawingPointerCancel);
    }
    // ======[修正ここまで]======

    
    // ======[修正箇所 (setTool)]======
    // [修正] 描画ツールとレイヤー制御のロジック
    function setTool(toolName) {
        const oldTool = state.currentTool;

        if (oldTool === toolName) {
            // ツールをOFFにする (nullモードへ)
            state.currentTool = null;
            if (oldTool === 'serif' || oldTool === 'draw') {
                endAutoScrollLock();
            }
        } else {
            // ツールをONにする（または切り替える）
            if (oldTool === 'serif' || oldTool === 'draw') {
                endAutoScrollLock();
            }

            state.currentTool = toolName;

            if (state.currentTool === 'serif' || state.currentTool === 'draw') {
                beginAutoScrollLock();
            }
        }
        
        // [最重要] レイヤーのタップ制御
        const isDrawMode = (state.currentTool === 'draw');
        pageElements.forEach(el => {
            // 描画モード時: main(手前)を無効化, drawing(奥)を有効化
            // それ以外: main(手前)を有効化, drawing(奥)を無効化
            el.mainCanvas.classList.toggle('pointer-none', isDrawMode);
            el.drawingCanvas.classList.toggle('pointer-none', !isDrawMode);
        });
        
        clearSelection();
        updateUI();
        renderActivePage(); // UIレイヤーの再描画
    }
    // ======[修正ここまで]======

    
    // (変更なし)
    function clearSelection() {
        state.selectedBubbleId = null;
    }

    // [修正] renderActivePage は UIレイヤー (mainCanvas) のみ
    function renderActivePage() {
        const page = getCurrentPage();
        if (!page) return;
        const el = pageElements[state.currentPageIndex];
        if (page && el) renderPage(page, el.mainCanvas);
    }

    // --- フォントサイズ (変更なし) ---
    function onChangeFontSizeByInput() {
        const currentSize = state.defaultFontSize;
        const newSizeStr = prompt("新しい文字サイズを入力してください (px)", currentSize);
        if (newSizeStr === null) return;
        const newSize = parseInt(newSizeStr, 10);
        if (isNaN(newSize) || newSize < 10 || newSize > 48) {
            alert("10〜48の間の数字を入力してください");
            return;
        }
        applyFontSize(newSize);
    }
    function handleSliderChange(e) {
        const newSize = parseInt(e.target.value, 10);
        applyFontSize(newSize);
    }
    function applyFontSize(newSize) {
        state.defaultFontSize = newSize;
        sliderFontSize.value = newSize; 
        fontSizeValueDisplay.innerHTML = `${newSize}px`; 
        
        const selectedBubble = getSelectedBubble();
        if (selectedBubble) {
            selectedBubble.font = newSize;
            measureBubbleSize(selectedBubble);
            if (bubbleEditor.style.display === 'block') {
                bubbleEditor.style.fontSize = '16px';
                bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
                updateBubbleEditorPosition(selectedBubble); 
            }
            saveAndRenderActivePage();
        }
    }
    // --- フォントサイズ (ここまで) ---


    // ======[修正箇所 (線幅)]======
    // [新設] 線幅スライダーのロジック
    function onChangeLineWidthByInput() {
        const currentSize = (state.currentDrawTool === 'pen') ? state.currentLineWidth : state.eraserWidth;
        const newSizeStr = prompt("新しい線の太さを入力してください (px)", currentSize);
        if (newSizeStr === null) return;
        const newSize = parseInt(newSizeStr, 10);
        if (isNaN(newSize) || newSize < 1 || newSize > 100) {
            alert("1〜100の間の数字を入力してください");
            return;
        }
        applyLineWidth(newSize);
    }
    
    function handleLineWidthSliderChange(e) {
        const newSize = parseInt(e.target.value, 10);
        applyLineWidth(newSize);
    }
    
    function applyLineWidth(newSize) {
        // 現在のツールに応じて、ペン/消しゴムの太さを更新
        if (state.currentDrawTool === 'pen') {
            state.currentLineWidth = newSize;
        } else {
            state.eraserWidth = newSize;
        }
        
        sliderLineWidth.value = newSize;
        lineWidthValueDisplay.innerHTML = `${newSize}px`;
        
        // 現在の描画コンテキストに即時反映
        const currentDrawingCtx = pageElements[state.currentPageIndex].drawingCtx;
        applyDrawingContextSettings(currentDrawingCtx);
    }
    
    // [新設] 描画ツールの切り替え
    function setDrawTool(toolName) { // 'pen' or 'eraser'
        state.currentDrawTool = toolName;
        
        // スライダーの値を、選択したツールの太さに合わせる
        const newSize = (toolName === 'pen') ? state.currentLineWidth : state.eraserWidth;
        sliderLineWidth.value = newSize;
        lineWidthValueDisplay.innerHTML = `${newSize}px`;
        
        // UIの active クラスを更新
        btnPen.classList.toggle('active', toolName === 'pen');
        btnEraser.classList.toggle('active', toolName === 'eraser');
        
        // 描画コンテキストに即時反映
        const currentDrawingCtx = pageElements[state.currentPageIndex].drawingCtx;
        applyDrawingContextSettings(currentDrawingCtx);
    }
    // ======[修正ここまで]======
    
    
    // --- UIレイヤー (mainCanvas) のイベント ---
    function getCanvasCoords(e) {
        const canvas = e.target; // mainCanvas
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return { x, y };
    }
    function getPageIndex(e) {
        return parseInt(e.target.dataset.pageIndex, 10);
    }
    // (変更なし)
    function onPointerDown(e) {
        const pageIndex = getPageIndex(e);
        setActivePage(pageIndex, false); 
        const { x, y } = getCanvasCoords(e);
        const page = getCurrentPage();
        if (!page) return;
        dragStartX = x; dragStartY = y;
        clearSelection();
        const panel = findPanelAt(page, x, y);
        if (!panel) return; 

        if (state.currentTool === 'serif') {
            const clickedBubble = findBubbleAt(page, panel, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                isDraggingBubble = true;
                if (state.isScrollLocked) e.preventDefault();
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
            } else {
                const newBubble = createBubble(panel, x, y);
                state.selectedBubbleId = newBubble.id;
                showBubbleEditor(newBubble);
            }
        } else if (state.currentTool === 'koma') {
            isDragging = true;
            if (state.isScrollLocked) e.preventDefault();
            dragCurrentX = x; dragCurrentY = y;
        } else {
            // 選択モード (ツールがnull)
            const clickedBubble = findBubbleAt(page, panel, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                isDraggingBubble = true;
                beginAutoScrollLock(); 
                if (state.isScrollLocked) e.preventDefault();
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
            }
        }
        updateUI();
        renderActivePage();
    }
    // (変更なし)
    function onPointerMove(e) {
      if (isDraggingBubble || (state.isScrollLocked && isDragging)) {
        e.preventDefault();
      } else if (!isDragging && !isDraggingBubble) {
        return; 
      }
      const page = getCurrentPage();
      if (!page) return;
      const { x, y } = getCanvasCoords(e);
      if (isDragging && state.currentTool === 'koma') {
        dragCurrentX = x;
        dragCurrentY = y;
        renderActivePage();
      } else if (isDraggingBubble) { 
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
    // (変更なし)
    function onPointerUp(e) {
        if (isDraggingBubble || (state.isScrollLocked && isDragging)) {
            e.preventDefault();
        }
        const { x, y } = getCanvasCoords(e);
        if (isDragging && state.currentTool === 'koma') {
            addKomaLine(dragStartX, dragStartY, x, y);
            saveAndRenderActivePage();
        } else if (isDraggingBubble) {
            const dx = x - dragStartX;
            const dy = y - dragStartY;
            const dist = Math.hypot(dx, dy);
            if (dist < KOMA_TAP_THRESHOLD && state.currentTool === 'serif') {
                const bubble = getSelectedBubble();
                if (bubble) showBubbleEditor(bubble);
            } else {
                if (bubbleEditor.style.display !== 'block') {
                     saveAndRenderActivePage();
                }
            }
            if (state.currentTool === null) {
                endAutoScrollLock();
            }
        }
        isDragging = false;
        isDraggingBubble = false;
        activePointerId = null;
    }
    // (変更なし)
    function onPointerCancel(e) {
        if (state.isScrollLocked && (isDragging || isDraggingBubble)) {
            e.preventDefault();
        }
        if (state.currentTool === null) {
            endAutoScrollLock();
        }
        isDragging = false;
        isDraggingBubble = false;
        activePointerId = null;
        if (bubbleEditor.style.display !== 'block') {
             saveAndRenderActivePage(); 
        }
    }
    // --- UIレイヤー (mainCanvas) のイベント (ここまで) ---

    
    // ======[修正箇所 (描画レイヤーのイベント)]======
    // [新設] 描画レイヤー (drawingCanvas) のイベント
    function getDrawingCoords(e) {
        const canvas = e.target; // drawingCanvas
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left),
            y: (e.clientY - rect.top)
        };
    }
    
    function onDrawingPointerDown(e) {
        // [修正] 描画レイヤーのコンテキストを取得
        const ctx = pageElements[state.currentPageIndex].drawingCtx;
        if (!ctx) return;
        
        isDrawingOnCanvas = true;
        const { x, y } = getDrawingCoords(e);
        
        ctx.beginPath();
        ctx.moveTo(x, y);  
        
        e.target.setPointerCapture(e.pointerId);
    }

    function onDrawingPointerMove(e) {
        if (!isDrawingOnCanvas) return; 
        const ctx = pageElements[state.currentPageIndex].drawingCtx;
        if (!ctx) return;

        // [修正] かくつき改善 (getCoalescedEvents)
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const event of events) {
            const { x, y } = getDrawingCoords(event);
            ctx.lineTo(x, y); 
        }
        ctx.stroke();
    }

    function onDrawingPointerUp(e) {
        if (!isDrawingOnCanvas) return;
        isDrawingOnCanvas = false;
        
        // [最重要] 描画が終わったら、現在のページを保存
        saveCurrentDrawing(state.currentPageIndex);
        
        e.target.releasePointerCapture(e.pointerId);
    }
    
    function onDrawingPointerCancel(e) {
        isDrawingOnCanvas = false;
        e.target.releasePointerCapture(e.pointerId);
    }
    // ======[修正ここまで]======


    // --- キーボードイベント (変更なし) ---
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
        if (keyCode === 'KeyL' && e.target.tagName !== 'TEXTAREA') {
            toggleScrollLock();
        }
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        if (keyCode === 'KeyS' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool('serif'); }
        if (keyCode === 'KeyK' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool('koma'); }
        if (keyCode === 'KeyD' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool('draw'); } // [修正] 'D'キー
    }

    // --- ページ管理ロジック ---
    function getCurrentPage() {
        return state.pages[state.currentPageIndex] || null;
    }

    // ======[修正箇所 (createNewPage)]======
    // [修正] drawingData を追加
    function createNewPage(frame) {
        const id = `page_${Date.now()}`;
        const initialPanel = frame ? createNewPanel(frame) : null;
        return { 
            id: id, 
            frame: frame, 
            panels: initialPanel ? [initialPanel] : [], 
            bubbles: [],
            drawingData: null // [新設] 描画データ保存場所
        };
    }
    // ======[修正ここまで]======
    
    // (変更なし)
    function createNewPanel(frame) {
        if (!frame) frame = { x: 0, y: 0, w: 100, h: 100 };
        return {
            id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            x: frame.x, y: frame.y, w: frame.w, h: frame.h,
        };
    }

    // (変更なし)
    function addPage(before = false) {
        const frame = state.pages.length > 0 ? state.pages[0].frame : null;
        const newPage = createNewPage(frame);
        const newIndex = state.currentPageIndex + (before ? 0 : 1);
        
        // [重要] ページを追加する前に、現在の描画を保存
        saveCurrentDrawing(state.currentPageIndex);
        
        state.pages.splice(newIndex, 0, newPage);
        const newEl = addPageToDOM(newPage, newIndex); // ここで 2枚のCanvasが作られる
        
        updatePageIndices();
        resizeAllCanvas(); // ここでリサイズと描画復元が走る
        setActivePage(newIndex, true);
        saveState();
    }

    // (変更なし)
    function deletePage() {
        if (state.pages.length <= 1) {
            resetCurrentPagePanels();
            resetCurrentPageBubbles();
            resetCurrentPageDrawing(); // [修正] 描画もリセット
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
    
    // (変更なし)
    function updatePageIndices() {
        pageElements.forEach((el, index) => {
            el.wrapper.dataset.pageIndex = index;
            el.mainCanvas.dataset.pageIndex = index;
            el.drawingCanvas.dataset.pageIndex = index;
        });
        updatePageIndicator(); 
    }
    
    // (変更なし)
    function resetCurrentPagePanels() {
        const page = getCurrentPage();
        if (page) {
            page.panels = [createNewPanel(page.frame)];
            clearSelection();
            saveAndRenderActivePage();
        }
    }
    // (変更なし)
    function resetCurrentPageBubbles() {
        const page = getCurrentPage();
        if (page) {
            page.bubbles = [];
            clearSelection();
            saveAndRenderActivePage();
        }
    }

    // ======[修正箇所 (描画リセット)]======
    // [新設] 描画リセット
    function resetCurrentPageDrawing() {
        const page = getCurrentPage();
        const el = pageElements[state.currentPageIndex];
        if (page && el) {
            // (1) 描画データを空にする
            page.drawingData = null;
            // (2) 描画キャンバスを即時クリア
            const cssWidth = el.drawingCanvas.width / state.dpr;
            const cssHeight = el.drawingCanvas.height / state.dpr;
            el.drawingCtx.clearRect(0, 0, cssWidth, cssHeight);
            // (3) (空の状態を)保存
            saveCurrentDrawing(state.currentPageIndex);
        }
    }
    // ======[修正ここまで]======

    // (変更なし)
    function resetAllData() {
        if (confirm("本当にリセットしますか？\nすべてのページとデータが消去されます。")) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    }

    // --- セリフ (フキダシ) ロジック (変更なし) ---
    function createBubble(panel, x, y) {
        const page = getCurrentPage();
        if (!page) return null; 
        const bubble = {
            id: `bubble_${Date.now()}`,
            x: x, y: y, 
            w: 100, h: 50, 
            text: "", 
            shape: 'ellipse',
            font: state.defaultFontSize,
            panelId: panel.id 
        };
        measureBubbleSize(bubble); 
        page.bubbles.push(bubble);
        return bubble;
    }
    function findBubbleAt(page, panel, x, y) {
        if (!page) return null;
        const hitboxPadding = 10; 
        for (let i = page.bubbles.length - 1; i >= 0; i--) {
            const b = page.bubbles[i];
            if (x >= b.x - b.w - hitboxPadding && 
                x <= b.x + hitboxPadding && 
                y >= b.y - hitboxPadding && 
                y <= b.y + b.h + hitboxPadding) {
                return b;
            }
        }
        return null;
    }
    // [修正済] カーソル末尾
    function showBubbleEditor(bubble) {
        hideBubbleEditor(); 
        state.selectedBubbleId = bubble.id;
        bubbleEditor.value = bubble.text;
        bubbleEditor.style.display = 'block';
        bubbleEditor.style.fontSize = '16px';
        bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
        updateBubbleEditorPosition(bubble);
        bubbleEditor.focus();
        if (bubble.text) {
            bubbleEditor.setSelectionRange(bubble.text.length, bubble.text.length); 
        }
        updateUI();
        renderActivePage();
    }
    
    // ========== [ここから修正] ==========
    // [修正] 編集エリアはCSSで画面中央に固定
    // JSはフキダシのサイズ(w, h)の更新のみを担当する
    function updateBubbleEditorPosition(bubble) {
      const w = bubble.w; 
      const h = bubble.h;
      bubbleEditor.style.width  = `${w}px`;
      bubbleEditor.style.height = `${h}px`;
      
      // 座標計算はすべてCSS側に移管したため、JSでの処理は不要
      // const el = pageElements[state.currentPageIndex];
      // const r = el.mainCanvas.getBoundingClientRect(); 
      // const left = r.left + bubble.x - w;   
      // const viewportTop = r.top + bubble.y;
      // const viewportCenterY = window.innerHeight / 2;
      // const pageScrollY = window.scrollY || document.documentElement.scrollTop;
      // let finalAbsTop; 
      // if (viewportTop > viewportCenterY) {
      //     finalAbsTop = pageScrollY + viewportCenterY;
      // } else {
      //     finalAbsTop = viewportTop + pageScrollY;
      // }
      // bubbleEditor.style.transform = `translate(${left}px, ${finalAbsTop}px)`;
      // bubbleEditor.style.left = '0px';
      // bubbleEditor.style.top  = '0px';
    }
    // ========== [ここまで修正] ==========

    function hideBubbleEditor() {
        if (bubbleEditor.style.display === 'block') {
            bubbleEditor.style.display = 'none';
            const bubble = getSelectedBubble();
            if (bubble) {
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
    function onBubbleEditorInput(e) {
      const bubble = getSelectedBubble();
      if (bubble) {
        bubble.text = e.target.value;
        measureBubbleSize(bubble);
        updateBubbleEditorPosition(bubble); 
      }
    }
    function onBubbleEditorKeyDown(e) { /* Escはグローバルで処理 */ }
    // [修正済] 12文字折り返し
    function measureBubbleSize(bubble) {
        const { text, font, shape } = bubble; 
        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; 
        const charHeight = font * BUBBLE_LINE_HEIGHT * 0.9; 
        const paddingX = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_X;
        const paddingY = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_Y;
        let totalColumns = 0;
        let maxHeight = 0;
        lines.forEach(line => {
            if (line.length === 0) {
                totalColumns++; 
                if (font > maxHeight) maxHeight = font; 
            } else {
                const colsForThisLine = Math.ceil(line.length / CHARS_PER_COLUMN);
                totalColumns += colsForThisLine;
                let heightForThisLine;
                if (colsForThisLine > 1) {
                    heightForThisLine = CHARS_PER_COLUMN * charHeight;
                } else {
                    heightForThisLine = line.length * charHeight;
                }
                if (heightForThisLine > maxHeight) maxHeight = heightForThisLine;
            }
        });
        if (lines.length === 0 || text.length === 0) {
             maxHeight = font; 
        }
        if (totalColumns === 0) {
            totalColumns = 1; 
        }
        const totalWidth = totalColumns * columnWidth;
        bubble.w = totalWidth + paddingX * 2;
        bubble.h = maxHeight + paddingY * 2;
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
            measureBubbleSize(bubble); 
            saveAndRenderActivePage();
        }
    }
    // --- セリフ (フキダシ) ロジック (ここまで) ---
    

    // --- コマ割りロジック (変更なし) ---
    function findPanelAt(page, x, y) {
        if (!page || !page.panels) return null;
        for (let i = page.panels.length - 1; i >= 0; i--) {
            const p = page.panels[i];
            if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
                return p;
            }
        }
        return null;
    }
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
            dir = (Math.abs(dx) > Math.abs(dy)) ? 'h' : 'v';
            pos = (dir === 'h') ? y1 : x1;
        }
        return { dir, pos };
    }
    function addKomaLine(x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;
        const panel = findPanelAt(page, x1, y1);
        if (!panel) return;
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        splitPanel(page, panel.id, dir, pos);
    }
    function splitPanel(page, panelId, dir, pos) {
        const panelIndex = page.panels.findIndex(p => p.id === panelId);
        if (panelIndex === -1) return;
        const p = page.panels[panelIndex];
        let panelA_bounds, panelB_bounds;
        if (dir === 'h') {
            const halfGutter = GUTTER_H / 2;
            const y1 = Math.max(p.y, pos - halfGutter);
            const y2 = Math.min(p.y + p.h, pos + halfGutter);
            panelA_bounds = { x: p.x, y: p.y, w: p.w, h: y1 - p.y };
            panelB_bounds = { x: p.x, y: y2, w: p.w, h: (p.y + p.h) - y2 };
        } else { 
            const halfGutter = GUTTER_V / 2;
            const x1 = Math.max(p.x, pos - halfGutter);
            const x2 = Math.min(p.x + p.w, pos + halfGutter);
            panelA_bounds = { x: p.x, y: p.y, w: x1 - p.x, h: p.h };
            panelB_bounds = { x: x2, y: p.y, w: (p.x + p.w) - x2, h: p.h };
        }
        page.panels.splice(panelIndex, 1);
        if (panelA_bounds.w > 1 && panelA_bounds.h > 1) { 
            page.panels.push(createNewPanel(panelA_bounds));
        }
        if (panelB_bounds.w > 1 && panelB_bounds.h > 1) {
            page.panels.push(createNewPanel(panelB_bounds));
        }
    }
    // --- コマ割りロジック (ここまで) ---


    // --- テキストコピー (変更なし) ---
    function findPanels(page) {
        if (!page.panels) return [];
        return [...page.panels].sort((a, b) => {
            if (Math.abs(a.y - b.y) < 10) return b.x - a.x; 
            return a.y - b.y; 
        });
    }
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
            const buckets = panels.map(() => []);
            let remaining = [];
            for (const b of bubbles) {
                let found = false;
                for (let i = 0; i < panels.length; i++) {
                    const p = panels[i];
                    if (b.x > p.x && b.x <= p.x + p.w && b.y >= p.y && b.y < p.y + p.h) {
                        buckets[i].push(b);
                        found = true;
                        break;
                    }
                }
                if (!found) remaining.push(b);
            }
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
    // --- テキストコピー (ここまで) ---
    
    // --- テキストペースト (変更なし) ---
    async function importText() {
        let text = "";
        try {
            text = await navigator.clipboard.readText();
            if (!text) {
                alert('クリップボードが空です');
                return;
            }
        } catch (e) {
            text = prompt('クリップボードの読み取りに失敗しました。\nテキストをここにペーストしてください：');
            if (text === null) return; 
        }

        const pagesData = parseTextImport(text);
        if (pagesData.length === 0) return;
        let insertIndex = state.currentPageIndex;
        let bubbleSeq = 0;
        
        // [重要] ペーストする前に、現在の描画を保存
        saveCurrentDrawing(state.currentPageIndex);

        pagesData.forEach((pageContent, i) => {
            let page;
            if (insertIndex < state.pages.length) {
                page = state.pages[insertIndex];
                page.panels = [createNewPanel(page.frame)];
                page.bubbles = [];
                page.drawingData = null; // [修正] 描画もリセット
            } else {
                const frame = state.pages[0].frame;
                page = createNewPage(frame);
                state.pages.push(page);
                addPageToDOM(page, insertIndex);
            }
            const frame = page.frame;
            const { w: fw, h: fh } = frame;
            const startX = frame.x + fw - 30; 
            const startY = frame.y + 30; 
            let currentX = startX, currentY = startY;
            pageContent.bubbles.forEach((text) => {
                const bubble = {
                    id: `bubble_import_${Date.now()}_${bubbleSeq++}`,
                    x: currentX, y: currentY, 
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
    // --- テキストペースト (ここまで) ---


    // ======[修正箇所 (書き出し)]======
    // [修正] 描画も書き出しに含める
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
        
        // (1) [修正] 背景を白で塗る (書き出し時のみ)
        offCtx.fillStyle = CANVAS_BG_COLOR;
        offCtx.fillRect(0, 0, offCanvas.width / scaleX / renderDPR, offCanvas.height / scaleY / renderDPR);

        // (2) [修正] 描画データを復元 (非同期)
        return new Promise((resolve) => {
            const imgString = page.drawingData;
            if (imgString) {
                const img = new Image();
                img.onload = () => {
                    offCtx.drawImage(img, 0, 0, cssWidth, cssHeight);
                    finishRender(); // (3)
                };
                img.src = imgString;
            } else {
                finishRender(); // (3)
            }

            function finishRender() {
                // (3) UIレイヤーを描画
                drawPageFrame(page, offCtx);
                drawKoma(page, offCtx, true); 
                page.bubbles.forEach(bubble => {
                    drawSingleBubble(bubble, offCtx); 
                });
                offCtx.restore();
                resolve(offCanvas); // (4) 完成したCanvasを返す
            }
            
            // [修正] 元のロジックでは描画レイヤーのcssWidth/cssHeightが未定義だったため修正
            // この関数はエディタのDOMに依存しないため、
            // offCanvasのサイズを基準にする
            const cssWidth = baseWidth;
            const cssHeight = baseHeight;
        });
    }

    async function exportPNG() {
        const page = getCurrentPage();
        if (!page) return;
        
        // [修正] renderPageToCanvas が Promise を返すように
        const offCanvas = await renderPageToCanvas(page, state.dpr); 
        
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
        
        // [修正] 非同期でCanvasを生成
        for (let i = 0; i < state.pages.length; i++) {
            const page = state.pages[i];
            const offCanvas = await renderPageToCanvas(page, 2); 
            const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
            zip.file(`page_${String(i + 1).padStart(3, '0')}.png`, blob);
        }
        
        zip.generateAsync({ type: 'blob' })
            .then(content => {
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'manganame_v16.zip'; // [修正] バージョンアップ
                a.click();
                URL.revokeObjectURL(url);
            });
    }
    // ======[修正ここまで]======


    // --- 汎用ヘルパー ---
    function saveAndRenderActivePage() {
        saveState();
        renderActivePage();
    }
    
    
    // ======[修正箇所 (描画のコアロジック)]======
    // [新設] 描画コンテキストに設定を適用
    function applyDrawingContextSettings(ctx) {
        if (!ctx) return;
        
        if (state.currentDrawTool === 'pen') {
            ctx.strokeStyle = 'black';
            ctx.lineWidth = state.currentLineWidth;
        } else { // eraser
            ctx.strokeStyle = CANVAS_BG_COLOR;
            ctx.lineWidth = state.eraserWidth;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    // [新設] 現在の描画(drawingCanvas)を state に保存
    function saveCurrentDrawing(pageIndex) {
        try {
            const page = state.pages[pageIndex];
            const el = pageElements[pageIndex];
            if (page && el) {
                const dataURL = el.drawingCanvas.toDataURL();
                page.drawingData = dataURL;
                saveState(); // [修正] 描画の保存は即時
            }
        } catch (e) {
            console.error("描画の保存に失敗しました。", e);
        }
    }
    
    // [新設] state の描画を drawingCanvas に復元
    function loadDrawing(pageIndex) {
        const page = state.pages[pageIndex];
        const el = pageElements[pageIndex];
        if (!page || !el) return;

        const ctx = el.drawingCtx;
        const cssWidth = el.drawingCanvas.width / state.dpr;
        const cssHeight = el.drawingCanvas.height / state.dpr;

        // (1) 描画キャンバスをクリア
        // (白で塗りつぶす。clearRectだと透明になり、リサイズ時に前の絵が残る)
        ctx.fillStyle = CANVAS_BG_COLOR;
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        // (2) 保存されたデータを復元
        const imgString = page.drawingData;
        if (imgString) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
                // (3) 復元後、現在のツール設定を再適用
                applyDrawingContextSettings(ctx);
            };
            img.src = imgString;
        } else {
             // (3) 新しいページの場合も、ツール設定を適用
            applyDrawingContextSettings(ctx);
        }
    }
    // ======[修正ここまで]======


    // --- 初期化実行 ---
    init();
});