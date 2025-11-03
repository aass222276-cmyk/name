document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 (v15) ---
    const STORAGE_KEY = 'manganame-v15'; // [v15]
    const B5_ASPECT_RATIO = Math.sqrt(2); 
    const PAGE_FRAME_PADDING = 15; 
    const GUTTER_H = 18; 
    const GUTTER_V = 9;  
    const BUBBLE_PADDING_X = 10; 
    const BUBBLE_PADDING_Y = 8;  
    const BUBBLE_PADDING_NONE = 2; // [新規] 枠なしの余白
    const BUBBLE_LINE_HEIGHT = 1.2; 
    const SNAP_ANGLE_THRESHOLD = 15; 
    const KOMA_TAP_THRESHOLD = 3; 
    // const KOMA_HIT_THRESHOLD = 30; // [v15] v13(No.116)のロジックには不要

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
    // [v15新設] リセットボタン (HTMLから移動してきた)
    const btnResetPanels = document.getElementById('btnResetPanels'); 
    const btnResetBubbles = document.getElementById('btnResetBubbles'); 
    const btnResetAllEl = document.getElementById('btnReset');    // 全削除
    const toolResetPanel = document.getElementById('toolResetPanel'); // [追加] (問題1)
    const selectionPanelBubble = document.getElementById('selectionPanelBubble');
    const shapeEllipse = document.getElementById('shapeEllipse');
    const shapeRect = document.getElementById('shapeRect');
    const shapeNone = document.getElementById('shapeNone'); // [新規]
    const deleteBubble = document.getElementById('deleteBubble');
    const bubbleEditor = document.getElementById('bubbleEditor');
    const textIO = document.getElementById('textIO');
    const pageIndicator = document.getElementById('pageIndicator');
    const scrollLockBtn = document.getElementById('scrollLockBtn'); // [v15新設]

    // --- アプリケーション状態 ---
    let state = {
        pages: [], // [v15] { id, frame, panels: [], bubbles: [] }
        currentPageIndex: 0, 
        currentTool: null, 
        defaultFontSize: 16,
        selectedBubbleId: null,
        dpr: window.devicePixelRatio || 1,
        isScrollLocked: false, // [v15新設]
    };
    
    let pageElements = []; // { wrapper: div, canvas: canvas, ctx: ctx }
    let activePointerId = null; // [v15] v13(No.116)のロジックに戻す

    // ドラッグ状態
    let isDragging = false; // コマ枠用
    let isDraggingBubble = false; // フキダシドラッグ用
    let dragStartX = 0, dragStartY = 0;
    let dragCurrentX = 0, dragCurrentY = 0;
    let dragBubbleOffsetX = 0, dragBubbleOffsetY = 0; 
    
    // [v15] スクロールロック状態（手動トグル用）
    let __scrollLocked = false;
    let __scrollLockY = 0;

    // --- スクロールロック (v15: "手動" solution) ---
    function toggleScrollLock() {
        state.isScrollLocked = !state.isScrollLocked;
        
        if (state.isScrollLocked) {
            // スクロールをロック
            __scrollLockY = window.scrollY || 0;
            document.body.style.position = 'fixed';
            document.body.style.top = (-__scrollLockY) + 'px';
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.width = '100%';
            // コンテナ自体のスクロールも止める
            canvasContainer.classList.add('scroll-locked');
            scrollLockBtn.classList.add('active');
        } else {
            // スクロールを解除
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

// --- 自動スクロールロック（ドラッグ中だけ）---
let __autoScrollLocked = false;
let __autoScrollY = 0;

function beginAutoScrollLock(){
  if (state.isScrollLocked || __autoScrollLocked) return;
  __autoScrollLocked = true;
  __autoScrollY = window.scrollY || 0;
  // body固定（親スクロールを完全停止）
  document.body.style.position = 'fixed';
  document.body.style.top = (-__autoScrollY) + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  // コンテナも保険で止める
  canvasContainer.classList.add('scroll-locked');
}

function endAutoScrollLock(){
  if (!__autoScrollLocked) return;
  __autoScrollLocked = false;
  // ユーザーの手動ロックがOFFなら元に戻す（ONなら触らない）
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
        // [v15修正] resizeAllCanvas は DOM 描画後に実行
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
                // [v15] panels 方式かチェック
                if (loadedData.pages && loadedData.pages[0] && loadedData.pages[0].panels) {
                    state.pages = loadedData.pages || [];
                    state.currentPageIndex = loadedData.currentPageIndex || 0;
                    state.defaultFontSize = loadedData.defaultFontSize || 16;
                } else {
                    // [v15] v14以前のデータ(gutters)は互換性がないため、リセット
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
    
    // [v15新設]
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
            
            // [v15] リサイズ時にパネルとフキダシの座標もスケーリング
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
                // [v15] 起動時バグ修正：frameが計算されたら、最初のパネルを追加
                page.panels = [createNewPanel(page.frame)];
            }
            
            renderPage(page, el.canvas);
        });
    }

    // --- UI更新 ---
    function updateUI() {
        // ツールバーのボタン状態
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');
        
        // キャンバスのカーソル状態
        pageElements.forEach(el => {
            el.canvas.classList.remove('tool-serif', 'tool-koma');
            if (state.currentTool === 'serif') el.canvas.classList.add('tool-serif');
            else if (state.currentTool === 'koma') el.canvas.classList.add('tool-koma');
        });

        // [修正] (問題1) ツールリセットパネルの表示制御
        const showResetKoma = (state.currentTool === 'koma');
        const showResetSerif = (state.currentTool === 'serif');
        
        btnResetPanels.classList.toggle('show', showResetKoma);
        btnResetBubbles.classList.toggle('show', showResetSerif);
        
        // どちらかのボタンが表示されていれば、親パネル自体を表示
        toolResetPanel.classList.toggle('show', showResetKoma || showResetSerif);

        // [修正] (問題1) 既存のフキダシ選択パネルの表示制御
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
        if (scrollToPage && !state.isScrollLocked) { // [v15] ロック中はスクロールしない
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
        context.lineWidth = 2; // [v15] 線の太さ
        context.strokeRect(x, y, w, h);
    }

    // [v15] コマ枠の描画ロジック (panels方式)
    function drawKoma(page, context, isExport = false) {
        if (!page.frame) return;

        // [v15] page.panels を描画するだけ（Tの字バグの根本解決）
        page.panels.forEach(panel => {
            if (isExport) {
                // TODO: 書き出し時のガター（白帯）描画
                // 現状はエディタと同じ枠線のみ
                context.strokeStyle = 'black';
                context.lineWidth = 2; // [v15] 線の太さ
                context.strokeRect(panel.x, panel.y, panel.w, panel.h);
            } else {
                // エディタ上: 黒の「実線」
                context.strokeStyle = 'black';
                context.lineWidth = 2; // [v15] 線の太さ
                context.setLineDash([]); 
                context.strokeRect(panel.x, panel.y, panel.w, panel.h);
            }
        });
    }

    // [v15] ドラッグ中の線も「現在のコマ」の範囲内「だけ」で描画
    function drawDragKomaLine(context, x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page || !page.frame) return;
        
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        
        // [v15] ドラッグ中の「現在」のコマを特定
        const panel = findPanelAt(page, x1, y1);
        if (!panel) return;

        // [v15] パネルの矩形（bounds）でクリップ
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
        // [v15] フキダシは page 直下
        page.bubbles.forEach(bubble => {
            if (state.selectedBubbleId === bubble.id && bubbleEditor.style.display === 'block') {
                return;
            }
            drawSingleBubble(bubble, context);
        });
    }

    // [修正] drawSingleBubble に「枠無」処理を追加
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
            case 'none': // [新規] 枠無は四角形として描画
                context.rect(-w, 0, w, h);
                break;
            case 'ellipse':
            default:
                context.ellipse(-w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
                break;
        }
        context.closePath();
        context.fill();
        if (shape !== 'none') { // [新規] 枠無以外の場合のみ枠線を描画
            context.stroke();
        }
        context.fillStyle = 'black';
        context.font = `${font}px 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif`;
        context.textAlign = 'center'; 
        context.textBaseline = 'top';
        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; 
        const charHeight = font * BUBBLE_LINE_HEIGHT;  
        
        // [新規] 枠無用の余白を適用
        const paddingX = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_X;
        const paddingY = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_Y;

        let currentX = -paddingX - (columnWidth / 2);
        const startY = paddingY;
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
        sliderFontSize.addEventListener('input', handleSliderChange); // [v15]
        fontSizeValueDisplay.addEventListener('click', onChangeFontSizeByInput); // [v15新設]
        btnPageAddBefore.addEventListener('click', () => addPage(true));
        btnPageAddAfter.addEventListener('click', () => addPage(false));
        btnPageDelete.addEventListener('click', deletePage);
        btnCopyText.addEventListener('click', exportText);
        btnPasteText.addEventListener('click', importText);
        btnPNG.addEventListener('click', exportPNG);
        btnZIP.addEventListener('click', exportZIP);
        btnResetPanels.addEventListener('click', resetCurrentPagePanels); // [v15新設]
        btnResetBubbles.addEventListener('click', resetCurrentPageBubbles); // [v15新設]
        btnResetAllEl.addEventListener('click', resetAllData); 
        shapeEllipse.addEventListener('click', () => setBubbleShape('ellipse'));
        shapeRect.addEventListener('click', () => setBubbleShape('rect'));
        shapeNone.addEventListener('click', () => setBubbleShape('none')); // [新規]
        deleteBubble.addEventListener('click', deleteSelectedBubble);
        bubbleEditor.addEventListener('input', onBubbleEditorInput);
        bubbleEditor.addEventListener('blur', hideBubbleEditor);
        bubbleEditor.addEventListener('keydown', onBubbleEditorKeyDown);
        window.addEventListener('keydown', onKeyDown);
        
        // [v15新設] スクロールロックボタン
        scrollLockBtn.addEventListener('click', toggleScrollLock);
        
        // [追加] (問題2) iOS/Safariのズーム防止
        setupZoomPrevention();
    }
    
    // [新規] (問題2) ズーム防止ロジック
    function setupZoomPrevention() {
        // ピンチズーム防止
        document.addEventListener('touchmove', function(event) {
            // 2本指以上（ピンチ）の場合、デフォルト動作（ズーム）をキャンセル
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        }, { passive: false }); // passive: false が必須

        // ダブルタップズーム防止
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(event) {
            // event.touches.length > 0 は、まだ指が残っている状態（ピンチの片方離しなど）
            if (event.touches.length > 0) return; 

            const now = (new Date()).getTime();
            // 300ms以内の連続タップ（ダブルタップ）
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false }); // passive: false が必須
    }
    
    // [v15] キャンバス毎のイベントリスナー (v13(No.116)に戻す)
    function setupCanvasEventListeners(canvas) {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove, { passive: false }); 
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerCancel); 
    }
    
    // ツール切り替え
    // [修正C] 「2案」の自動ロックを実装
    function setTool(toolName) {
        const oldTool = state.currentTool;

        if (oldTool === toolName) {
            // ツールをOFFにする
            state.currentTool = null;
            // [修正C] セリフモードをOFFにする時、ロックも解除
            if (oldTool === 'serif') {
                endAutoScrollLock();
            }
        } else {
            // ツールをONにする（または切り替える）
            
            // [修正C] 古いツールがセリフモードなら、まずロック解除
            if (oldTool === 'serif') {
                endAutoScrollLock();
            }

            state.currentTool = toolName;

            // [修正C] 新しいツールがセリフモードなら、ロック
            if (state.currentTool === 'serif') {
                beginAutoScrollLock();
            }
        }
        
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

    // [v15新設] フォントサイズ変更（手入力）
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

    // [v15新設] フォントサイズ変更（スライダー）
    function handleSliderChange(e) {
        const newSize = parseInt(e.target.value, 10);
        applyFontSize(newSize);
    }

    // [v15新設] フォントサイズ変更（共通処理）
    function applyFontSize(newSize) {
        state.defaultFontSize = newSize;
        sliderFontSize.value = newSize; 
        fontSizeValueDisplay.innerHTML = `${newSize}<br>px`; 
        
        const selectedBubble = getSelectedBubble();
        if (selectedBubble) {
            selectedBubble.font = newSize;
            measureBubbleSize(selectedBubble);
            // v13(No.116)のロジックを維持（セリフ入力は変えない）
            if (bubbleEditor.style.display === 'block') {
                // [修正A] ズーム対策のため、入力欄のフォントは16px固定
                bubbleEditor.style.fontSize = '16px';
                bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
                updateBubbleEditorPosition(selectedBubble); 
            }
            saveAndRenderActivePage();
        }
    }

    // --- キャンバスイベント (v15: "手動" solution) ---
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

    // [修正] onPointerDown (ロック関連を削除)
    function onPointerDown(e) {
        // [v15] setPointerCapture は使わない
        
        const pageIndex = getPageIndex(e);
        setActivePage(pageIndex, false); 
        
        const { x, y } = getCanvasCoords(e);
        const page = getCurrentPage();
        if (!page) return;

        // [修正B] タップ/ドラッグ判定のため、down時点で座標を記録
        dragStartX = x; dragStartY = y;

        clearSelection();
        const panel = findPanelAt(page, x, y);
        if (!panel) return; 

        if (state.currentTool === 'serif') {
            // [修正B-2] 当たり判定を拡大した findBubbleAt を呼ぶ
            const clickedBubble = findBubbleAt(page, panel, x, y);
            if (clickedBubble) {
                // [修正B-1] タップで即編集せず、ドラッグ移動の準備
                state.selectedBubbleId = clickedBubble.id;
                isDraggingBubble = true;
                // [修正C] ロックは setTool が行うため、ここでは何もしない
                if (state.isScrollLocked) e.preventDefault();
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;

            } else {
                // [修正B-1] 何もない場所は、従来通り即時作成＆編集
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
                beginAutoScrollLock(); // [修正C] nullツール時は手動でロック
                if (state.isScrollLocked) e.preventDefault();
                dragBubbleOffsetX = clickedBubble.x - x;
                dragBubbleOffsetY = clickedBubble.y - y;
            }
        }
        
        updateUI();
        renderActivePage();
    }

function onPointerMove(e) {
  // セリフ（バブル）移動中は常にスクロール抑止
  // [修正B] セリフモードでもドラッグ中はスクロール抑止
  if (isDraggingBubble || (state.isScrollLocked && isDragging)) {
    e.preventDefault();
  } else if (!isDragging && !isDraggingBubble) {
    return; // ドラッグ中でなければ何もしない
  }

  const page = getCurrentPage();
  if (!page) return;
  const { x, y } = getCanvasCoords(e);

  if (isDragging && state.currentTool === 'koma') {
    dragCurrentX = x;
    dragCurrentY = y;
    renderActivePage();
  } else if (isDraggingBubble) { // [修正B-1] 'serif' または 'null' ツールで移動
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

    // [修正B/C] onPointerUp のロジックを変更
    function onPointerUp(e) {
        // [修正B/C] セリフモードでもドラッグ中は preventDefault
        if (isDraggingBubble || (state.isScrollLocked && isDragging)) {
            e.preventDefault();
        }

        const { x, y } = getCanvasCoords(e);

        if (isDragging && state.currentTool === 'koma') {
            addKomaLine(dragStartX, dragStartY, x, y);
            saveAndRenderActivePage();

        } else if (isDraggingBubble) {
            
            // [修正B-1] タップかドラッグかを判定
            const dx = x - dragStartX;
            const dy = y - dragStartY;
            const dist = Math.hypot(dx, dy);

            if (dist < KOMA_TAP_THRESHOLD && state.currentTool === 'serif') {
                // [修正B-1] セリフモードで「タップ」されたと判断 -> 編集開始
                const bubble = getSelectedBubble();
                if (bubble) showBubbleEditor(bubble);
            } else {
                // [修正B-1] ドラッグ終了、または null モードでのタップ
                if (bubbleEditor.style.display !== 'block') {
                     saveAndRenderActivePage();
                }
            }

            // [修正C] 'null' モードのドラッグが終了したのでロック解除
            if (state.currentTool === null) {
                endAutoScrollLock();
            }
        }
        
        // [v15] 共通のドラッグ終了処理
        isDragging = false;
        isDraggingBubble = false;
        activePointerId = null;
    }
    
    // [修正C] onPointerCancel のロジックを変更
    function onPointerCancel(e) {
        if (state.isScrollLocked && (isDragging || isDraggingBubble)) {
            e.preventDefault();
        }

        // [修正C] 'null' モードのドラッグがキャンセルされたのでロック解除
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
        // [v15新設] 'L' キーでスクロールロック
        if (keyCode === 'KeyL' && e.target.tagName !== 'TEXTAREA') {
            toggleScrollLock();
        }
        
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        if (keyCode === 'KeyS' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool('serif'); }
        if (keyCode === 'KeyK' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setTool('koma'); }
    }

    // --- ページ管理ロジック ---
    function getCurrentPage() {
        return state.pages[state.currentPageIndex] || null;
    }

    // [v15]
    function createNewPage(frame) {
        const id = `page_${Date.now()}`;
        const initialPanel = frame ? createNewPanel(frame) : null;
        return { 
            id: id, 
            frame: frame, 
            panels: initialPanel ? [initialPanel] : [], // [v15]
            bubbles: [] // [v15] bubbles は page 直下
        };
    }
    
    // [v15]
    function createNewPanel(frame) {
        // [v15] frameがnullの場合の安全策
        if (!frame) frame = { x: 0, y: 0, w: 100, h: 100 };
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
            // [v15] 最後の1ページは「全リセット」と同じ
            resetCurrentPagePanels();
            resetCurrentPageBubbles();
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
    
    // [v15新設] コマ枠リセット
    function resetCurrentPagePanels() {
        const page = getCurrentPage();
        if (page) {
            page.panels = [createNewPanel(page.frame)];
            clearSelection();
            saveAndRenderActivePage();
        }
    }
    
    // [v15新設] セリフリセット
    function resetCurrentPageBubbles() {
        const page = getCurrentPage();
        if (page) {
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
            x: x, y: y, // [v15] (x, y) は「右上」
            w: 100, h: 50, 
            text: "", // [v15] "セリフ" -> "" (空)
            shape: 'ellipse',
            font: state.defaultFontSize,
            panelId: panel.id // [v15] 属するパネルを記録
        };
        measureBubbleSize(bubble); 
        page.bubbles.push(bubble);
        return bubble;
    }

    // [修正B-2] フキダシの当たり判定を拡大 (維持)
    function findBubbleAt(page, panel, x, y) {
        if (!page) return null;
        // [修正B-2] スマホの指操作を考慮し、10pxの余白（パディング）を追加
        const hitboxPadding = 10; 
        // [v15] page直下のbubblesを検索
        for (let i = page.bubbles.length - 1; i >= 0; i--) {
            const b = page.bubbles[i];
            // [修正B-2] 判定ロジックに hitboxPadding を適用
            if (x >= b.x - b.w - hitboxPadding && 
                x <= b.x + hitboxPadding && 
                y >= b.y - hitboxPadding && 
                y <= b.y + b.h + hitboxPadding) {
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
        
        // [修正A] ズーム対策のため、入力欄のフォントは16px固定 (維持)
        bubbleEditor.style.fontSize = '16px';
        bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
        
        updateBubbleEditorPosition(bubble);
        bubbleEditor.focus();
        if (bubble.text) {
            bubbleEditor.select();
        }
        updateUI();
        renderActivePage();
    }
    
function updateBubbleEditorPosition(bubble) {
  const canvas = pageElements[state.currentPageIndex].canvas;
  const r = canvas.getBoundingClientRect();
  const scrollY = canvasContainer.scrollTop;

  const w = bubble.w; // 物理の横幅（列の合計）
  const h = bubble.h; // 物理の縦幅（1列の長さ）

  bubbleEditor.style.width  = `${w}px`;
  bubbleEditor.style.height = `${h}px`;

  const left = r.left + bubble.x - w;   // 右上アンカー
  const top  = r.top  + scrollY + bubble.y;

  bubbleEditor.style.transform = `translate(${left}px, ${top}px)`;
  bubbleEditor.style.left = '0px';
  bubbleEditor.style.top  = '0px';
}




    function hideBubbleEditor() {
        if (bubbleEditor.style.display === 'block') {
            bubbleEditor.style.display = 'none';
            const bubble = getSelectedBubble();
            if (bubble) {
                // [v15] v13(No.116)のロジック（blur時にリサイズ）
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

    // [v15修正] v13(No.116)の「入力限界」バグのあるロジックに差し戻し
function onBubbleEditorInput(e) {
  const bubble = getSelectedBubble();
  if (bubble) {
    bubble.text = e.target.value;
    measureBubbleSize(bubble);           // ←復活
    updateBubbleEditorPosition(bubble);  // ←復活
  }
}
    
    function onBubbleEditorKeyDown(e) { /* Escはグローバルで処理 */ }

    // [修正] 縦書き用のサイズ測定に「枠無」処理を追加
    function measureBubbleSize(bubble) {
        const { text, font, shape } = bubble; // [新規] shape を取得
        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; 
        const charHeight = font * BUBBLE_LINE_HEIGHT * 0.9; 
        
        // [新規] 枠無用の余白を適用
        const paddingX = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_X;
        const paddingY = (shape === 'none') ? BUBBLE_PADDING_NONE : BUBBLE_PADDING_Y;

        let maxHeight = 0;
        lines.forEach(line => {
            const height = line.length * charHeight;
            if (height > maxHeight) maxHeight = height;
        });
        if (maxHeight === 0) { 
             maxHeight = font;
        }
        const totalWidth = lines.length * columnWidth;
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
            measureBubbleSize(bubble); // [新規] 枠無はサイズが変わるため再計算
            saveAndRenderActivePage();
        }
    }

    // --- コマ割りロジック (v15) ---
    // [v15] v13(No.116)の panels 方式を維持

    // [v15] (x, y) が含まれる「パネル（コマ）」を返す
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

    // [v15] タップ（水平線）判定 + 斜め線は強制スナップ
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
            // [v15] 斜め線は強制スナップ
            dir = (Math.abs(dx) > Math.abs(dy)) ? 'h' : 'v';
            pos = (dir === 'h') ? y1 : x1;
        }
        return { dir, pos };
    }

    // [v15]
    function addKomaLine(x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;
        const panel = findPanelAt(page, x1, y1);
        if (!panel) return;
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        splitPanel(page, panel.id, dir, pos);
    }
    
    // [v15] パネル分割（Tの字バグの根本解決）
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
        } else { // dir === 'v'
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

    // --- [v15] テキストコピー（コマ順ソート） ---
    
    // [v15] findPanelsは、単にソート済みのpanelsを返すだけ
    function findPanels(page) {
        if (!page.panels) return [];
        // コマを漫画の読み順（上→下、右→左）でソート
        return [...page.panels].sort((a, b) => {
            if (Math.abs(a.y - b.y) < 10) return b.x - a.x; 
            return a.y - b.y; 
        });
    }
    
    // [v15] コマ内のフキダシをソート（右優先→上優先）
    function sortBubblesInPanel(bubbles) {
        return bubbles.sort((a, b) => {
            if (Math.abs(a.x - b.x) < 10) return a.y - b.y; 
            return b.x - a.x; 
        });
    }

    // [v15修正] exportText（「コピー抜け」バグ修正）
    function exportText() {
        let output = "";
        state.pages.forEach((page, pageIndex) => {
            const panels = findPanels(page);
            let bubbles = [...page.bubbles];
            
            // [v15] "コピー抜け" バグ修正（No.121/125）
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

    // [v15修正] importText（`prompt`バグ修正）
    async function importText() {
        let text = "";
        try {
            // [v15] クリップボードから自動読み取り
            text = await navigator.clipboard.readText();
            if (!text) {
                alert('クリップボードが空です');
                return;
            }
        } catch (e) {
            // 権限がない、またはPCのFirefoxなど
            text = prompt('クリップボードの読み取りに失敗しました。\nテキストをここにペーストしてください：');
            if (text === null) return; 
        }

        const pagesData = parseTextImport(text);
        if (pagesData.length === 0) return;
        let insertIndex = state.currentPageIndex;
        // ★ 重複ID防止：バブルの連番を持つ
        let bubbleSeq = 0;

        pagesData.forEach((pageContent, i) => {
            let page;
            if (insertIndex < state.pages.length) {
                page = state.pages[insertIndex];
                // [v15] ページリセット
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
                    id: `bubble_import_${Date.now()}_${bubbleSeq++}_${Math.random().toString(36).slice(2,6)}`,
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
    
    // [v15新設] parseTextImport (v13(No.116)で抜けていた)
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
        drawKoma(page, offCtx, true); // [v15] 修正された描画ロジックで書き出し
        page.bubbles.forEach(bubble => {
            drawSingleBubble(bubble, offCtx); 
        });
        offCtx.restore();
        return offCanvas;
    }

    // [v15] PNG書き出し (Web Share API)
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
                a.download = 'manganame_v15.zip';
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