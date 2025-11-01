document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 (v5) ---
    const STORAGE_KEY = 'manganame_v5'; // [v5]
    const B5_ASPECT_RATIO = Math.sqrt(2); 
    const PAGE_FRAME_PADDING = 15; 
    const GUTTER_H = 18; 
    const GUTTER_V = 9;  
    const BUBBLE_PADDING_X = 10; 
    const BUBBLE_PADDING_Y = 8;  
    const BUBBLE_LINE_HEIGHT = 1.2; 
    const SNAP_ANGLE_THRESHOLD = 15; 
    const KOMA_TAP_THRESHOLD = 3; // タップとみなす移動距離
    const KOMA_HIT_THRESHOLD = 30; // [v5修正] コマ枠の当たり判定を30pxに拡大

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
    let dragBubbleOffsetX = 0, dragBubbleOffsetY = 0; // [v5] フキダシ「右上」とのオフセット

    // --- 初期化 ---
    function init() {
        registerServiceWorker();
        loadState();
        setupEventListeners();
        createPageDOMElements();
        resizeAllCanvas(); 
        updateUI();
        setActivePage(state.currentPageIndex, false); 
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

    // [v5修正] コマ枠の延長ロジック
    function drawKoma(page, context, isExport = false) {
        if (!page.frame) return;
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;

        page.gutters.forEach(gutter => {
            const { dir, pos, bounds } = gutter;
            
            // [v5] bounds（この線が属するコマ）を基準に、他の線との交差を計算して描画範囲を決定
            let clipX = bounds.x, clipY = bounds.y, clipW = bounds.w, clipH = bounds.h;

            page.gutters.forEach(otherGutter => {
                if (gutter === otherGutter) return;
                
                // otherGutterがbounds内にあるか簡易チェック
                const intersects = !(otherGutter.bounds.x > bounds.x + bounds.w ||
                                     otherGutter.bounds.x + otherGutter.bounds.w < bounds.x ||
                                     otherGutter.bounds.y > bounds.y + bounds.h ||
                                     otherGutter.bounds.y + otherGutter.bounds.h < bounds.y);
                if (!intersects) return;

                // 自分の向きと「違う」向きの線で、描画範囲を狭める
                if (dir === 'h' && otherGutter.dir === 'v') {
                    // 水平線は、交差する「垂直線」によって分断される
                    if (otherGutter.pos > clipX && otherGutter.pos < clipX + clipW) {
                         // TODO: このロジックは不完全。
                         // 本来は「この水平線」が「どの垂直線にぶつかるか」を双方向で計算する必要があり、
                         // findPanels() (コマ矩形特定) のロジックが必須。
                         // 現状は、v4の「boundsの範囲で描画」ロジックに戻す。
                    }
                }
                if (dir === 'v' && otherGutter.dir === 'h') {
                    // 垂直線は、交差する「水平線」によって分断される
                }
            });
            
            // [v5修正] v4のロジックに戻す（コマ延長は別途findPanelsで対応）
            clipX = Math.max(fx, bounds.x);
            clipY = Math.max(fy, bounds.y);
            clipW = Math.min(fx + fw, bounds.x + bounds.w) - clipX;
            clipH = Math.min(fy + fh, bounds.y + bounds.h) - clipY;


            if (clipW <= 0 || clipH <= 0) return;

            if (isExport) {
                // 書き出し時
                const gutterWidth = (dir === 'h') ? GUTTER_H : GUTTER_V;
                const halfGutter = gutterWidth / 2;
                context.fillStyle = 'white';
                if (dir === 'h') {
                    context.fillRect(clipX, pos - halfGutter, clipW, gutterWidth);
                } else {
                    context.fillRect(pos - halfGutter, clipY, gutterWidth, clipH);
                }
                context.strokeStyle = 'black';
                context.lineWidth = 1;
                context.beginPath();
                if (dir === 'h') {
                    context.moveTo(clipX, pos - halfGutter); context.lineTo(clipX + clipW, pos - halfGutter);
                    context.moveTo(clipX, pos + halfGutter); context.lineTo(clipX + clipW, pos + halfGutter);
                } else {
                    context.moveTo(pos - halfGutter, clipY); context.lineTo(pos - halfGutter, clipY + clipH);
                    context.moveTo(pos + halfGutter, clipY); context.lineTo(pos + halfGutter, clipY + clipH);
                }
                context.stroke();
            } else {
                // エディタ上: 黒の「実線」
                context.strokeStyle = 'black';
                context.lineWidth = 1; 
                context.setLineDash([]); 
                context.beginPath();
                if (dir === 'h') {
                    context.moveTo(clipX, pos);
                    context.lineTo(clipX + clipW, pos);
                } else {
                    context.moveTo(pos, clipY);
                    context.lineTo(pos, clipY + clipH);
                }
                context.stroke();
            }
        });
    }

    // [v5修正] ドラッグ中の線も同様の（不完全な）ロジック
    function drawDragKomaLine(context, x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page || !page.frame) return;
        
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        const komaBounds = findKomaAt(page, x1, y1);
        
        // [v5] 本来はここでも他のガターを考慮すべきだが、v4ロジックで描画
        const clipX = komaBounds.x;
        const clipY = komaBounds.y;
        const clipW = komaBounds.w;
        const clipH = komaBounds.h;

        context.strokeStyle = '#007bff'; 
        context.lineWidth = 1;
        context.setLineDash([]); 
        context.beginPath();
        if (dir === 'h') {
            context.moveTo(clipX, pos);
            context.lineTo(clipX + clipW, pos);
        } else {
            context.moveTo(pos, clipY);
            context.lineTo(pos, clipY + clipH);
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

    // [v5修正] フキダシ描画 (右上アンカー)
    function drawSingleBubble(bubble, context) {
        const { x, y, w, h, shape, text, font } = bubble;
        
        context.save();
        context.translate(x, y); // [v5] (x, y) は「右上」

        // 1. フキダシの形状
        context.fillStyle = 'white';
        context.strokeStyle = 'black';
        context.lineWidth = 2;

        context.beginPath();
        switch (shape) {
            case 'rect':
                // [v5] (0, 0) を右上として描画
                context.rect(-w, 0, w, h);
                break;
            case 'ellipse':
            default:
                // [v5] (0, 0) が右上になるよう、中心をずらす
                context.ellipse(-w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
                break;
        }
        context.closePath();
        context.fill();
        context.stroke();

        // 2. テキスト描画 (縦書き)
        context.fillStyle = 'black';
        context.font = `${font}px 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif`;
        context.textAlign = 'center'; 
        context.textBaseline = 'top';

        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; 
        const charHeight = font * BUBBLE_LINE_HEIGHT;  

        // [v5] 右上 (0,0) を基準に描画開始位置を計算
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
        // [v5] フキダシ選択 (右上アンカー)
        const bubble = getSelectedBubble(page);
        if (bubble && bubbleEditor.style.display !== 'block') {
            context.strokeStyle = '#007bff';
            context.lineWidth = 2;
            context.setLineDash([6, 3]);
            // [v5] (x, y) は右上
            context.strokeRect(
                bubble.x - bubble.w - 2, 
                bubble.y - 2, 
                bubble.w + 4, 
                bubble.h + 4
            );
            context.setLineDash([]);
        }
        
        // コマ枠選択 (v4から変更なし)
        const gutter = getSelectedGutter(page);
        if(gutter && page.frame) { 
            const { dir, pos, bounds } = gutter;
            context.strokeStyle = '#007bff'; 
            context.lineWidth = 4; 
            context.setLineDash([6, 3]);
            context.beginPath();
            
            // [v5] v4のロジック（不完全）
            const clipX = Math.max(page.frame.x, bounds.x);
            const clipY = Math.max(page.frame.y, bounds.y);
            const clipW = Math.min(page.frame.x + page.frame.w, bounds.x + bounds.w) - clipX;
            const clipH = Math.min(page.frame.y + page.frame.h, bounds.y + bounds.h) - clipY;

            if (dir === 'h') {
                context.moveTo(clipX, pos);
                context.lineTo(clipX + clipW, pos);
            } else {
                context.moveTo(pos, clipY);
                context.lineTo(pos, clipY + clipH);
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
        // [v5] passive: false は不要（touch-actionで制御）
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
                // [v5] 「右上アンカー」とのオフセットを計算
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
                // [v5] ドラッグ開始時にスクロールを無効化
                e.target.classList.add('dragging');
            }
        }
        
        updateUI();
        renderActivePage();
    }

    function onPointerMove(e) {
        // [v5] ドラッグ中はスクロールを止める (touch-action が効かない場合のための保険)
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
                // [v5] 「右上アンカー」を更新
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
            // [v5] ドラッグ終了時にスクロールを有効化
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
            if (bubbleEditor.style.display === 'block') {
                bubbleEditor.blur(); 
            } else {
                clearSelection();
                updateUI();
                renderActivePage();
            }
        }
        
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        if (keyCode === 'KeyS' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault(); setTool('serif');
        }
        if (keyCode === 'KeyK' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault(); setTool('koma');
        }
    }

    // --- ページ管理ロジック ---
    function getCurrentPage() {
        return state.pages[state.currentPageIndex] || null;
    }

    function createNewPage() {
        const id = `page_${Date.now()}`;
        const page = {
            id: id,
            frame: null, 
            gutters: [],
            bubbles: []
        };
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
    }

    function resetAllData() {
        if (confirm("本当にリセットしますか？\nすべてのページとデータが消去されます。")) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    }


    // --- セリフ (フキダシ) ロジック ---
    // [v5修正] フキダシ作成 (右上アンカー)
    function createBubble(x, y) {
        const page = getCurrentPage();
        if (!page) return null; 
        const bubble = {
            id: `bubble_${Date.now()}`,
            x: x, y: y, // [v5] (x, y) は「右上」
            w: 100, h: 50, 
            text: "セリフ",
            shape: 'ellipse',
            font: state.defaultFontSize
        };
        measureBubbleSize(bubble); // サイズ計算
        page.bubbles.push(bubble);
        return bubble;
    }

    // [v5修正] フキダシ当たり判定 (右上アンカー)
    function findBubbleAt(page, x, y) {
        if (!page) return null;
        for (let i = page.bubbles.length - 1; i >= 0; i--) {
            const b = page.bubbles[i];
            // [v5] (b.x, b.y) は「右上」
            if (
                x >= b.x - b.w && // 左端
                x <= b.x &&       // 右端
                y >= b.y &&       // 上端
                y <= b.y + b.h    // 下端
            ) {
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
    
    // [v5修正] エディタ位置 (右上アンカー)
    function updateBubbleEditorPosition(bubble) {
        const canvas = pageElements[state.currentPageIndex].canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const containerScrollTop = canvasContainer.scrollTop;
        
        // [v5] (bubble.x, bubble.y) は「右上」
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
            // [v5] サイズ変更してもアンカー (x, y) は不変
            measureBubbleSize(bubble);
            updateBubbleEditorPosition(bubble);
        }
    }
    
    function onBubbleEditorKeyDown(e) {
        // Escキーでの終了 (blur) はグローバルのonKeyDownで処理
    }

    // 縦書き用のサイズ測定 (v3から変更なし)
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

    function findKomaAt(page, x, y) {
        if (!page || !page.frame) return { x: 0, y: 0, w: 0, h: 0 };
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;
        let bounds = { x: fx, y: fy, w: fw, h: fh }; 

        page.gutters.forEach(gutter => {
            const { dir, pos, bounds: gutterBounds } = gutter;
            if (x >= bounds.x && x <= bounds.x + bounds.w && 
                y >= bounds.y && y <= bounds.y + bounds.h) {
                const intersects = !(gutterBounds.x > bounds.x + bounds.w || gutterBounds.x + gutterBounds.w < bounds.x || gutterBounds.y > bounds.y + bounds.h || gutterBounds.y + gutterBounds.h < bounds.y);
                if (!intersects) return;
                if (dir === 'h' && y >= gutterBounds.y && y <= gutterBounds.y + gutterBounds.h) {
                    if (y > pos) { 
                        const newY = pos + GUTTER_H / 2; bounds.h = (bounds.y + bounds.h) - newY; bounds.y = newY;
                    } else { 
                        bounds.h = (pos - GUTTER_H / 2) - bounds.y;
                    }
                } else if (dir === 'v' && x >= gutterBounds.x && x <= gutterBounds.x + gutterBounds.w) {
                    if (x > pos) { 
                        const newX = pos + GUTTER_V / 2; bounds.w = (bounds.x + bounds.w) - newX; bounds.x = newX;
                    } else { 
                        bounds.w = (pos - GUTTER_V / 2) - bounds.x;
                    }
                }
            }
        });
        bounds.w = Math.min(bounds.x + bounds.w, fx + fw) - bounds.x;
        bounds.h = Math.min(bounds.y + bounds.h, fy + fh) - bounds.y;
        return bounds;
    }

    // [v5修正] タップ（水平線）判定
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
        const komaBounds = findKomaAt(page, x1, y1);
        page.gutters.push({
            id: `gutter_${Date.now()}`, 
            dir: dir, pos: pos, bounds: komaBounds 
        });
    }

    // [v5修正] 当たり判定を拡大
    function findGutterAt(page, x, y) {
        if (!page) return null;
        for (let i = page.gutters.length - 1; i >= 0; i--) {
            const gutter = page.gutters[i];
            const { dir, pos, bounds } = gutter;
            if (x >= bounds.x && x <= bounds.x + bounds.w &&
                y >= bounds.y && y <= bounds.y + bounds.h) {
                if (dir === 'h' && Math.abs(y - pos) < KOMA_HIT_THRESHOLD) return gutter;
                if (dir === 'v' && Math.abs(x - pos) < KOMA_HIT_THRESHOLD) return gutter;
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


    // --- [v5新設] テキストコピー（コマ順ソート） ---
    
    // ページから全コマの矩形を計算する
    function findPanels(page) {
        if (!page.frame) return [];
        
        let panels = [page.frame]; // スタートはページ全体
        
        // 縦横のガターでリストを分ける
        const vGutters = page.gutters.filter(g => g.dir === 'v').sort((a, b) => a.pos - b.pos);
        const hGutters = page.gutters.filter(g => g.dir === 'h').sort((a, b) => a.pos - b.pos);

        // ガターで再帰的にコマを分割していく
        // (簡易版：ガターがどのコマに属するか(bounds)を見て分割)
        // (注：これはv5のコマ延長描画ロジックが未実装のため、不完全なコマ順になります)
        
        let finalPanels = [];
        
        // 簡易ロジック: v3/v4 の findKomaAt を逆利用して、
        // ページをグリッド状にサンプリングし、ユニークなコマ矩形を集める
        // (これはパフォーマンスが悪いが、正確なコマ分割ロジックより実装が容易)
        
        const knownBounds = new Set();
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;
        
        // ページ内をサンプリング
        for(let y = fy + 1; y < fy + fh; y += 10) {
            for(let x = fx + 1; x < fx + fw; x += 10) {
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
            if (Math.abs(a.y - b.y) < 10) { // ほぼ同じ高さ
                return b.x - a.x; // 右 (X大) が先
            }
            return a.y - b.y; // 上 (Y小) が先
        });
        
        return finalPanels;
    }
    
    // コマ内のフキダシをソート（右→上）
    function sortBubblesInPanel(bubbles) {
        return bubbles.sort((a, b) => {
            if (Math.abs(a.x - b.x) < 10) { // ほぼ同じX（右）
                return a.y - b.y; // 上 (Y小) が先
            }
            return b.x - a.x; // 右 (X大) が先
        });
    }

    function exportText() {
        let output = "";
        state.pages.forEach((page, pageIndex) => {
            
            // 1. ページ内の全コマを読み順で取得
            const panels = findPanels(page);
            
            // 2. 全フキダシをコピー（仕分け用）
            let bubbles = [...page.bubbles];
            
            // 3. コマ順に処理
            panels.forEach((panel) => {
                let bubblesInPanel = [];
                
                // 4. フキダシをコマに割り当て
                // (右上アンカー (b.x, b.y) がコマ内にあるか)
                bubbles = bubbles.filter(b => {
                    if (b.x > panel.x && b.x <= panel.x + panel.w &&
                        b.y > panel.y && b.y <= panel.y + panel.h) {
                        bubblesInPanel.push(b);
                        return false; // 仕分け済みなのでリストから削除
                    }
                    return true;
                });
                
                // 5. コマ内のフキダシをソート（右→上）
                sortBubblesInPanel(bubblesInPanel);
                
                // 6. テキスト出力
                bubblesInPanel.forEach((bubble, bubbleIndex) => {
                    output += bubble.text;
                    output += "\n\n"; // フキダシ間は空行1
                });
            });
            
            // (コマに割り当てられなかったフキダシは無視)

            if (pageIndex < state.pages.length - 1) {
                output += "\n\n"; // ページ間は空行 (合計3改行)
            }
        });
        
        textIO.value = output.trim(); // 最後の余分な改行を削除
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
            // [v5] 右上アンカーで配置
            const startX = frame.x + fw - 30; // 右から
            const startY = frame.y + 30; // 上から
            let currentX = startX, currentY = startY;

            pageContent.bubbles.forEach((text, bubbleIndex) => {
                const bubble = {
                    id: `bubble_import_${Date.now()}_${i}_${bubbleIndex}`,
                    x: currentX, y: currentY, // 右上アンカー
                    w: 0, h: 0, 
                    text: text, shape: 'ellipse', font: state.defaultFontSize
                };
                measureBubbleSize(bubble);
                page.bubbles.push(bubble);
                
                currentY += bubble.h + 20; // 次は下へ
                if (currentY > frame.y + fh - bubble.h) {
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

    function exportPNG() {
        const page = getCurrentPage();
        if (!page) return;
        const offCanvas = renderPageToCanvas(page, state.dpr); 
        offCanvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `page_${state.currentPageIndex + 1}.png`;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
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
                a.download = 'manganame_v5.zip';
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