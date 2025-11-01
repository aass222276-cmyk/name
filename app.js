document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 (v4) ---
    const STORAGE_KEY = 'manganame_v4'; // v4
    const B5_ASPECT_RATIO = Math.sqrt(2); 
    const PAGE_FRAME_PADDING = 15; 
    const GUTTER_H = 18; 
    const GUTTER_V = 9;  
    const BUBBLE_PADDING_X = 10; 
    const BUBBLE_PADDING_Y = 8;  
    const BUBBLE_LINE_HEIGHT = 1.2; 
    const SNAP_ANGLE_THRESHOLD = 15; 
    const KOMA_TAP_THRESHOLD = 3; // [v4追加] タップとみなす移動距離
    const KOMA_HIT_THRESHOLD = 25; // [v4修正] コマ枠の当たり判定を25pxに拡大

    // --- DOM要素 (v4) ---
    // (canvas は動的に生成されるため、ここでは取得しない)
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
    const btnReset = document.getElementById('btnReset'); // [v4追加]

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

    // --- アプリケーション状態 (v4) ---
    let state = {
        pages: [],
        currentPageIndex: 0, // 最後に操作したページのインデックス
        currentTool: null, // 'serif', 'koma', or null (選択モード)
        defaultFontSize: 16,
        selectedBubbleId: null,
        selectedGutterId: null, 
        dpr: window.devicePixelRatio || 1,
    };
    
    // [v4] DOM要素とページ状態をマッピング
    // (JSで生成したcanvas要素などを保持)
    let pageElements = []; // { wrapper: div, canvas: canvas, ctx: ctx }

    // ドラッグ状態
    let isDragging = false; // コマ枠用
    let isDraggingBubble = false; // [v4追加] フキダシドラッグ用
    let dragStartX = 0, dragStartY = 0;
    let dragCurrentX = 0, dragCurrentY = 0;
    let dragBubbleOffsetX = 0, dragBubbleOffsetY = 0; // フキダシ中心とのオフセット

    // --- 初期化 (v4) ---
    function init() {
        registerServiceWorker();
        loadState();
        setupEventListeners();
        
        // [v4修正] 全ページのDOMとCanvasを生成
        createPageDOMElements();
        
        resizeAllCanvas(); // サイズ計算と初期描画
        updateUI();
        
        // アクティブページをハイライト
        setActivePage(state.currentPageIndex, false); // スクロールはしない
    }

    // --- PWA (Service Worker) ---
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered.', reg))
                .catch(err => console.error('Service Worker registration failed.', err));
        }
    }

    // --- 状態管理 (LocalStorage) (v4) ---
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

    // --- [v4新設] ページDOM生成 ---
    function createPageDOMElements() {
        canvasContainer.innerHTML = ''; // コンテナをクリア
        pageElements = []; // DOM参照配列もクリア
        
        state.pages.forEach((page, index) => {
            addPageToDOM(page, index);
        });
    }

    // --- [v4新設] ページDOM追加 (指定インデックス) ---
    function addPageToDOM(page, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'page-wrapper';
        wrapper.dataset.pageIndex = index;
        
        const canvas = document.createElement('canvas');
        canvas.className = 'mainCanvas';
        canvas.dataset.pageIndex = index; // ページインデックスをDOMに保持
        
        const ctx = canvas.getContext('2d');
        
        wrapper.appendChild(canvas);
        
        const elementRef = { wrapper, canvas, ctx };

        // [v4] DOMと参照配列に挿入
        if (index >= pageElements.length) {
            // 末尾に追加
            canvasContainer.appendChild(wrapper);
            pageElements.push(elementRef);
        } else {
            // 途中に挿入
            const nextElement = pageElements[index];
            canvasContainer.insertBefore(wrapper, nextElement.wrapper);
            pageElements.splice(index, 0, elementRef);
        }

        // [v4] 各キャンバスにイベントリスナーを設定
        setupCanvasEventListeners(canvas);
        
        return elementRef;
    }

    // --- [v4修正] キャンバスリサイズ (全ページ) ---
    function resizeAllCanvas() {
        state.dpr = window.devicePixelRatio || 1;
        
        if (pageElements.length === 0) return;

        // 代表して最初のキャンバスでCSS幅を取得（全ページ同じ幅のため）
        const firstCanvas = pageElements[0].canvas;
        if (!firstCanvas.clientWidth) {
            // DOMがまだ描画されていない場合、少し待つ
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

            // Canvas解像度設定
            el.canvas.width = canvasWidth;
            el.canvas.height = canvasHeight;
            el.ctx.scale(state.dpr, state.dpr);
            
            // ページデータのframeサイズ更新
            page.frame = { 
                x: PAGE_FRAME_PADDING, 
                y: PAGE_FRAME_PADDING, 
                w: frameW, 
                h: frameH 
            };
            
            // 描画
            renderPage(page, el.canvas);
        });
    }

    // --- UI更新 (v4) ---
    function updateUI() {
        // ツールトグル
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');

        // カーソル制御 (CSSクラスで一括)
        pageElements.forEach(el => {
            el.canvas.classList.remove('tool-serif', 'tool-koma');
            if (state.currentTool === 'serif') {
                el.canvas.classList.add('tool-serif');
            } else if (state.currentTool === 'koma') {
                el.canvas.classList.add('tool-koma');
            }
        });

        // 選択パネル
        const selectedBubble = getSelectedBubble();
        const selectedGutter = getSelectedGutter();
        
        selectionPanelBubble.classList.toggle('show', !!selectedBubble);
        selectionPanelGutter.classList.toggle('show', !!selectedGutter);
        
        // [v4修正] パネルは画面下部固定 (CSSで対応)
        // 位置調整ロジックは不要

        // テキストエディタ
        if (!selectedBubble) {
            hideBubbleEditor();
        }
        
        // ページストリップは廃止
    }

    // --- [v4新設] アクティブページ設定 ---
    function setActivePage(index, scrollToPage = true) {
        if (index < 0 || index >= pageElements.length) return;

        // 他のページのアクティブを解除
        pageElements.forEach(el => {
            el.wrapper.classList.remove('active');
        });
        
        // 対象ページをアクティブに
        const activeElement = pageElements[index];
        activeElement.wrapper.classList.add('active');
        
        state.currentPageIndex = index;

        // 対象ページまでスクロール
        if (scrollToPage) {
            activeElement.wrapper.scrollIntoView({
                behavior: 'smooth',
                block: 'center' // ページ中央に
            });
        }
    }


    // --- [v4修正] 描画 (指定ページのみ) ---
    function renderPage(page, canvas) {
        if (!page || !canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // frameが未設定（リサイズ前）なら何もしない
        if (!page.frame) return;

        const cssWidth = canvas.clientWidth;
        const cssHeight = canvas.clientHeight;

        ctx.save();
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        drawPageFrame(page, ctx);
        drawKoma(page, ctx, false); // false = ガイド線モード
        drawBubbles(page, ctx);
        drawSelection(page, ctx);
        
        // ドラッグ中の描画 (アクティブページのみ)
        if (state.currentPageIndex === state.pages.indexOf(page)) {
            if (isDragging && state.currentTool === 'koma') {
                drawDragKomaLine(ctx, dragStartX, dragStartY, dragCurrentX, dragCurrentY);
            }
            // [v4] フキダシドラッグ中のプレビューは move イベント内で描画
        }

        ctx.restore();
    }
    
    // (描画ヘルパー関数 drawPageFrame, drawKoma, drawBubbles, drawSingleBubble, drawSelection はv3修正版から変更なし)
    // (※ただし、v3修正版(実線)のコードを使用)

    function drawPageFrame(page, context) {
        if (!page.frame) return;
        const { x, y, w, h } = page.frame;
        context.strokeStyle = 'black';
        context.lineWidth = 2;
        context.strokeRect(x, y, w, h);
    }

    function drawKoma(page, context, isExport = false) {
        if (!page.frame) return;
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;

        page.gutters.forEach(gutter => {
            const { dir, pos, bounds } = gutter;
            
            const clipX = Math.max(fx, bounds.x);
            const clipY = Math.max(fy, bounds.y);
            const clipW = Math.min(fx + fw, bounds.x + bounds.w) - clipX;
            const clipH = Math.min(fy + fh, bounds.y + bounds.h) - clipY;

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
                context.setLineDash([]); // 実線
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

    function drawDragKomaLine(context, x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page || !page.frame) return;
        
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        const komaBounds = findKomaAt(page, x1, y1);
        const clipX = komaBounds.x;
        const clipY = komaBounds.y;
        const clipW = komaBounds.w;
        const clipH = komaBounds.h;

        context.strokeStyle = '#007bff'; 
        context.lineWidth = 1;
        context.setLineDash([]); // 実線
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

    function drawSingleBubble(bubble, context) {
        const { x, y, w, h, shape, text, font } = bubble;
        const radius = 10; 

        context.save();
        context.translate(x, y); 
        context.fillStyle = 'white';
        context.strokeStyle = 'black';
        context.lineWidth = 2;

        context.beginPath();
        switch (shape) {
            case 'rect':
                context.rect(-w / 2, -h / 2, w, h);
                break;
            case 'saw': // (v4では削除されたが、データ互換性のため残してもよい)
            case 'ellipse':
            default:
                context.ellipse(0, 0, w / 2, h / 2, 0, 0, 2 * Math.PI);
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

        let currentX = (w / 2) - BUBBLE_PADDING_X - (columnWidth / 2);
        const startY = (-h / 2) + BUBBLE_PADDING_Y;

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
        // フキダシ
        const bubble = getSelectedBubble(page);
        if (bubble && bubbleEditor.style.display !== 'block') {
            context.strokeStyle = '#007bff';
            context.lineWidth = 2;
            context.setLineDash([6, 3]);
            context.strokeRect(
                bubble.x - bubble.w / 2 - 2, 
                bubble.y - bubble.h / 2 - 2, 
                bubble.w + 4, 
                bubble.h + 4
            );
            context.setLineDash([]);
        }
        
        // コマ枠
        const gutter = getSelectedGutter(page);
        if(gutter && page.frame) { 
            const { dir, pos, bounds } = gutter;
            context.strokeStyle = '#007bff'; 
            context.lineWidth = 4; 
            context.setLineDash([6, 3]);
            context.beginPath();
            
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

    // --- イベントリスナー設定 (v4) ---
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
        btnReset.addEventListener('click', resetAllData); // [v4追加]

        // キーボード
        window.addEventListener('keydown', onKeyDown);

        // 選択パネル (フキダシ)
        shapeEllipse.addEventListener('click', () => setBubbleShape('ellipse'));
        shapeRect.addEventListener('click', () => setBubbleShape('rect'));
        // (ギザギザは削除)
        deleteBubble.addEventListener('click', deleteSelectedBubble);
        
        // 選択パネル (コマ枠)
        deleteGutter.addEventListener('click', deleteSelectedGutter);

        // テキストエディタ
        bubbleEditor.addEventListener('input', onBubbleEditorInput);
        bubbleEditor.addEventListener('blur', hideBubbleEditor);
        bubbleEditor.addEventListener('keydown', onBubbleEditorKeyDown);
    }
    
    // --- [v4新設] キャンバス毎のイベントリスナー ---
    function setupCanvasEventListeners(canvas) {
        // [v4修正] Pointer Events (passive: false でドラッグ中のスクロール禁止を可能に)
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove, { passive: false });
        canvas.addEventListener('pointerup', onPointerUp);
        // [v4] pointercancel も追加 (ドラッグがOS等に奪われた時)
        canvas.addEventListener('pointercancel', onPointerUp); 
    }
    
    // ツール切り替え
    function setTool(toolName) {
        if (state.currentTool === toolName) {
            state.currentTool = null;
        } else {
            state.currentTool = toolName;
        }
        
        // ツール変更時は選択解除
        clearSelection();
        updateUI();
        renderActivePage(); // 選択枠を消すため再描画
    }
    
    // [v4新設] 選択解除
    function clearSelection() {
        state.selectedBubbleId = null;
        state.selectedGutterId = null;
    }

    // [v4新設] アクティブページ（現在選択中のページ）の再描画
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

    // --- キャンバスイベント (v4) ---
    function getCanvasCoords(e) {
        // [v4修正] e.target (タップされたcanvas) を基準にする
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return { x, y };
    }

    // [v4] イベントからページインデックスを取得
    function getPageIndex(e) {
        return parseInt(e.target.dataset.pageIndex, 10);
    }

    function onPointerDown(e) {
        const pageIndex = getPageIndex(e);
        // タップしたページをアクティブにする
        setActivePage(pageIndex, false); // スクロールは不要
        
        const { x, y } = getCanvasCoords(e);
        const page = getCurrentPage();
        if (!page) return;

        // 他の選択を解除
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
                dragStartX = x;
                dragStartY = y;
                dragCurrentX = x;
                dragCurrentY = y;
            }
        } else {
            // 選択モード (ツールがnull)
            // [v4] フキダシドラッグ開始
            const clickedBubble = findBubbleAt(page, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                isDraggingBubble = true;
                // フキダシ中心とタップ位置のオフセットを計算
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
            }
        }
        
        updateUI();
        renderActivePage();
    }

    function onPointerMove(e) {
        // [v4] ドラッグ中はブラウザの縦スクロールを禁止
        if (isDragging || isDraggingBubble) {
            e.preventDefault();
        }
        
        const page = getCurrentPage();
        if (!page) return;
        const { x, y } = getCanvasCoords(e);

        if (isDragging && state.currentTool === 'koma') {
            // コマ枠ドラッグ
            dragCurrentX = x;
            dragCurrentY = y;
            renderActivePage(); // ドラッグ中ガイド線を描画
        } else if (isDraggingBubble && state.currentTool === null) {
            // [v4] フキダシドラッグ
            const bubble = getSelectedBubble();
            if (bubble) {
                bubble.x = x + dragBubbleOffsetX;
                bubble.y = y + dragBubbleOffsetY;
                
                // フキダシ編集中ならエディタも追従
                if (bubbleEditor.style.display === 'block') {
                    updateBubbleEditorPosition(bubble);
                }
                renderActivePage();
            }
        }
    }

    function onPointerUp(e) {
        if (isDragging && state.currentTool === 'koma') {
            // コマ枠ドラッグ終了
            isDragging = false;
            const { x, y } = getCanvasCoords(e);
            addKomaLine(dragStartX, dragStartY, x, y);
            saveAndRenderActivePage();
        } else if (isDraggingBubble) {
            // [v4] フキダシドラッグ終了
            isDraggingBubble = false;
            // 編集中でなければ保存
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
        
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            return;
        }

        if (keyCode === 'KeyS' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setTool('serif');
        }
        if (keyCode === 'KeyK' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setTool('koma');
        }
    }

    // --- ページ管理ロジック (v4) ---
    function getCurrentPage() {
        return state.pages[state.currentPageIndex] || null;
    }

    function createNewPage() {
        const id = `page_${Date.now()}`;
        const page = {
            id: id,
            frame: null, // resizeAllCanvas で設定
            gutters: [],
            bubbles: []
        };
        // 仮のframeを設定（resizeAllCanvasが呼ばれるまでの保険）
        const cssWidth = pageElements.length > 0 ? pageElements[0].canvas.clientWidth : 300; 
        const cssHeight = cssWidth * B5_ASPECT_RATIO;
        page.frame = { 
            x: PAGE_FRAME_PADDING, 
            y: PAGE_FRAME_PADDING, 
            w: cssWidth - PAGE_FRAME_PADDING * 2, 
            h: cssHeight - PAGE_FRAME_PADDING * 2 
        };
        return page;
    }

    function addPage(before = false) {
        const newPage = createNewPage();
        const newIndex = state.currentPageIndex + (before ? 0 : 1);

        // 1. state 配列に挿入
        state.pages.splice(newIndex, 0, newPage);
        
        // 2. DOMを生成・挿入
        const newEl = addPageToDOM(newPage, newIndex);
        
        // 3. インデックス更新 (DOMの data-page-index も更新)
        updatePageIndices();
        
        // 4. 新しいページのサイズ計算と描画
        resizeAllCanvas(); // (本当は新ページだけでよいが、簡略化のため全リサイズ)
        
        // 5. 新しいページをアクティブにし、そこへスクロール
        setActivePage(newIndex, true);

        saveState();
    }

    function deletePage() {
        if (state.pages.length <= 1) {
            // 最後の1ページはリセット
            state.pages[0] = createNewPage();
            clearSelection();
            saveAndRenderActivePage();
            return;
        }
        
        const deleteIndex = state.currentPageIndex;
        
        // 1. DOMから削除
        pageElements[deleteIndex].wrapper.remove();
        
        // 2. 参照配列から削除
        pageElements.splice(deleteIndex, 1);
        
        // 3. state 配列から削除
        state.pages.splice(deleteIndex, 1);
        
        // 4. インデックス更新
        updatePageIndices();
        
        // 5. 次のアクティブページを計算
        const newIndex = Math.max(0, deleteIndex - 1); // 削除したページの1つ上
        setActivePage(newIndex, true);

        saveState();
    }
    
    // [v4新設] DOMと参照配列のインデックスを再同期
    function updatePageIndices() {
        pageElements.forEach((el, index) => {
            el.wrapper.dataset.pageIndex = index;
            el.canvas.dataset.pageIndex = index;
        });
    }

    // [v4追加] リセット処理
    function resetAllData() {
        if (confirm("本当にリセットしますか？\nすべてのページとデータが消去されます。")) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    }


    // --- セリフ (フキダシ) ロジック ---
    // (v3からの変更は、描画/保存が renderActivePage() / saveAndRenderActivePage() になった点)

    function createBubble(x, y) {
        const page = getCurrentPage();
        if (!page) return null;
        const bubble = {
            id: `bubble_${Date.now()}`,
            x: x, y: y,
            w: 100, h: 50, 
            text: "セリフ",
            shape: 'ellipse',
            font: state.defaultFontSize
        };
        measureBubbleSize(bubble); 
        page.bubbles.push(bubble);
        return bubble;
    }

    function findBubbleAt(page, x, y) {
        if (!page) return null;
        for (let i = page.bubbles.length - 1; i >= 0; i--) {
            const b = page.bubbles[i];
            if (
                x >= b.x - b.w / 2 &&
                x <= b.x + b.w / 2 &&
                y >= b.y - b.h / 2 &&
                y <= b.y + b.h / 2
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
    
    function updateBubbleEditorPosition(bubble) {
        // [v4修正] アクティブなcanvasのClientRectを基準にする
        const canvas = pageElements[state.currentPageIndex].canvas;
        const canvasRect = canvas.getBoundingClientRect();
        
        // containerのスクロール量を考慮
        const containerScrollTop = canvasContainer.scrollTop;
        
        const editorWidth = bubble.w;
        const editorHeight = bubble.h;

        // テキストエリアは position: absolute (canvasContainer基準)
        bubbleEditor.style.width = `${editorWidth}px`;
        bubbleEditor.style.height = `${editorHeight}px`;
        bubbleEditor.style.left = `${canvasRect.left + bubble.x - editorWidth / 2}px`;
        bubbleEditor.style.top = `${canvasRect.top + containerScrollTop + bubble.y - editorHeight / 2}px`;
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

    // [v4修正] 引数で渡されたページからバブルを探す
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

    // [v4修正] タップ（水平線）判定
    function getKomaSnapDirection(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);

        // [v4] 移動距離が閾値未満なら、強制的に「水平」
        if (dist < KOMA_TAP_THRESHOLD) {
            return { dir: 'h', pos: y1 };
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

        // [v4修正] タップ（水平線）ロジックのため、distチェックは getKomaSnapDirection に移動
        // const dist = Math.hypot(x2 - x1, y2 - y1);
        // if (dist < 10) return; // v3のロジックを削除

        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        const komaBounds = findKomaAt(page, x1, y1);

        page.gutters.push({
            id: `gutter_${Date.now()}`, 
            dir: dir,
            pos: pos,
            bounds: komaBounds 
        });
    }

    // [v4修正] 当たり判定を拡大
    function findGutterAt(page, x, y) {
        if (!page) return null;
        
        // [v4] 認識範囲を拡大
        const HIT_THRESHOLD_H = KOMA_HIT_THRESHOLD; 
        const HIT_THRESHOLD_V = KOMA_HIT_THRESHOLD;

        for (let i = page.gutters.length - 1; i >= 0; i--) {
            const gutter = page.gutters[i];
            const { dir, pos, bounds } = gutter;
            if (x >= bounds.x && x <= bounds.x + bounds.w &&
                y >= bounds.y && y <= bounds.y + bounds.h) {
                if (dir === 'h' && Math.abs(y - pos) < HIT_THRESHOLD_H) return gutter;
                if (dir === 'v' && Math.abs(x - pos) < HIT_THRESHOLD_V) return gutter;
            }
        }
        return null;
    }

    // [v4修正] 引数で渡されたページからガターを探す
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


    // --- テキスト入出力 --- 
    function exportText() {
        textIO.value = formatTextExport(state.pages);
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
                // DOMも追加
                addPageToDOM(page, insertIndex);
            }
            
            const frame = page.frame || { x: PAGE_FRAME_PADDING, y: PAGE_FRAME_PADDING, w: 200, h: 280 };
            const { w: fw, h: fh } = frame;
            const startX = frame.x + fw - 60; 
            const startY = frame.y + 60; 
            const colWidth = 80; 
            let currentX = startX, currentY = startY;

            pageContent.bubbles.forEach((text, bubbleIndex) => {
                const bubble = {
                    id: `bubble_import_${Date.now()}_${i}_${bubbleIndex}`,
                    x: currentX, y: currentY, w: 0, h: 0, 
                    text: text, shape: 'ellipse', font: state.defaultFontSize
                };
                measureBubbleSize(bubble);
                page.bubbles.push(bubble);
                currentX -= (bubble.w + 20); 
                if (currentX < frame.x + bubble.w / 2) {
                    currentX = startX; currentY += 120; 
                }
            });
            insertIndex++;
        });
        
        // インデックスを更新
        updatePageIndices();
        // 全リサイズ＆描画
        resizeAllCanvas();
        // 最後のインポート先をアクティブに
        setActivePage(Math.min(insertIndex - 1, state.pages.length - 1), true);

        saveState();
    }
    
    // (formatTextExport, parseTextImport はv3から変更なし)
    function formatTextExport(pages) {
        let output = "";
        pages.forEach((page, pageIndex) => {
            const sortedBubbles = [...page.bubbles].sort((a, b) => {
                if (Math.abs(a.y - b.y) < 30) return b.x - a.x; 
                return a.y - b.y; 
            });
            sortedBubbles.forEach((bubble, bubbleIndex) => {
                output += bubble.text;
                if (bubbleIndex < sortedBubbles.length - 1) output += "\n\n"; 
            });
            if (pageIndex < pages.length - 1) output += "\n\n\n"; 
        });
        return output;
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

    // [v4修正] renderPageToCanvas は、対象ページ(page)のみを受け取る
    function renderPageToCanvas(page, renderDPR = 2) {
        const baseWidth = 1000; 
        const baseHeight = baseWidth * B5_ASPECT_RATIO;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = baseWidth * renderDPR;
        offCanvas.height = baseHeight * renderDPR;
        const offCtx = offCanvas.getContext('2d');
        
        offCtx.scale(renderDPR, renderDPR);

        const frame = page.frame; // この時点で frame は必ず設定されている前提
        const scaleX = baseWidth / (frame.w + PAGE_FRAME_PADDING * 2);
        const scaleY = baseHeight / (frame.h + PAGE_FRAME_PADDING * 2);

        offCtx.save();
        offCtx.scale(scaleX, scaleY);

        offCtx.fillStyle = 'white';
        offCtx.fillRect(0, 0, offCanvas.width / scaleX / renderDPR, offCanvas.height / scaleY / renderDPR);

        drawPageFrame(page, offCtx);
        drawKoma(page, offCtx, true); // true = 書き出しモード
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
                a.download = 'manganame_v4.zip';
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