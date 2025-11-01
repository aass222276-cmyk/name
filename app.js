document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 ---
    const STORAGE_KEY = 'manganame_v3';
    const B5_ASPECT_RATIO = Math.sqrt(2); // 縦/横 ≈ 1.414
    const PAGE_FRAME_PADDING = 15; // キャンバス端から内枠までの余白
    const GUTTER_H = 18; // 横ガター幅
    const GUTTER_V = 9;  // 縦ガター幅
    const BUBBLE_PADDING_X = 10;
    const BUBBLE_PADDING_Y = 8;
    const BUBBLE_LINE_HEIGHT = 1.2;
    const SNAP_ANGLE_THRESHOLD = 15; // 角度スナップの閾値 (度)
    const THUMBNAIL_WIDTH = (60 - 12) / B5_ASPECT_RATIO; // CSSのpagestrip-heightに基づく

    // --- DOM要素 ---
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
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

    // ページストリップ
    const pagestrip = document.getElementById('pagestrip');

    // 選択パネル
    const selectionPanel = document.getElementById('selectionPanel');
    const shapeEllipse = document.getElementById('shapeEllipse');
    const shapeRect = document.getElementById('shapeRect');
    const shapeSaw = document.getElementById('shapeSaw');
    const deleteBubble = document.getElementById('deleteBubble');

    // テキスト編集
    const bubbleEditor = document.getElementById('bubbleEditor');
    const textIO = document.getElementById('textIO');

    // --- アプリケーション状態 ---
    let state = {
        pages: [],
        currentPageIndex: 0,
        currentTool: 'serif', // 'serif', 'koma'
        defaultFontSize: 16,
        selectedBubbleId: null,
        scale: 1.0, // キャンバスの表示スケール (CSSピクセル / 実ピクセル)
        dpr: window.devicePixelRatio || 1,
    };

    // ドラッグ状態
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // --- 初期化 ---
    function init() {
        registerServiceWorker();
        loadState();
        setupEventListeners();
        resizeCanvas();
        updateUI();
        render();
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
                
                // データの整合性チェック
                if (state.pages.length === 0 || state.currentPageIndex >= state.pages.length) {
                    createNewPage();
                    state.currentPageIndex = 0;
                }
            } catch (e) {
                console.error("Failed to load state, initializing:", e);
                createNewPage();
            }
        } else {
            createNewPage();
        }
        sliderFontSize.value = state.defaultFontSize;
        fontSizeValue.textContent = `${state.defaultFontSize}px`;
    }

    // --- キャンバスリサイズ ---
    function resizeCanvas() {
        state.dpr = window.devicePixelRatio || 1;
        const containerRect = canvasContainer.getBoundingClientRect();
        
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        let canvasCssWidth, canvasCssHeight;

        // コンテナの比率とB5の比率を比較
        if (containerWidth / containerHeight > 1 / B5_ASPECT_RATIO) {
            // コンテナが横長 -> 高さに合わせる
            canvasCssHeight = containerHeight;
            canvasCssWidth = containerHeight / B5_ASPECT_RATIO;
        } else {
            // コンテナが縦長 -> 幅に合わせる
            canvasCssWidth = containerWidth;
            canvasCssHeight = containerWidth * B5_ASPECT_RATIO;
        }

        canvas.style.width = `${canvasCssWidth}px`;
        canvas.style.height = `${canvasCssHeight}px`;

        // 高解像度対応
        canvas.width = Math.round(canvasCssWidth * state.dpr);
        canvas.height = Math.round(canvasCssHeight * state.dpr);

        ctx.scale(state.dpr, state.dpr);

        // スケール（CSSピクセルからCanvasピクセルへの変換率）を保存
        state.scale = canvas.width / canvasCssWidth / state.dpr; // 常に1.0になるはずだが念のため
        
        // ページのframe情報を更新
        const frameW = canvasCssWidth - PAGE_FRAME_PADDING * 2;
        const frameH = canvasCssHeight - PAGE_FRAME_PADDING * 2;
        
        if (getCurrentPage()) {
             getCurrentPage().frame = { 
                x: PAGE_FRAME_PADDING, 
                y: PAGE_FRAME_PADDING, 
                w: frameW, 
                h: frameH 
            };
        }
       
        render();
    }

    // --- UI更新 ---
    function updateUI() {
        // ツールトグル
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');
        canvas.style.cursor = (state.currentTool === 'koma') ? 'crosshair' : 'default';

        // 選択パネル
        const selectedBubble = getSelectedBubble();
        selectionPanel.classList.toggle('show', !!selectedBubble);
        if (selectedBubble) {
            // パネル位置の調整（簡易的にキャンバス下部）
            const canvasRect = canvas.getBoundingClientRect();
            selectionPanel.style.bottom = `${window.innerHeight - canvasRect.bottom + 10}px`;
        }

        // テキストエディタ
        if (!getSelectedBubble()) {
            hideBubbleEditor();
        }
        
        updatePageStrip();
    }

    // --- ページストリップ更新 ---
    function updatePageStrip() {
        pagestrip.innerHTML = '';
        state.pages.forEach((page, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'page-thumbnail';
            thumb.classList.toggle('active', index === state.currentPageIndex);
            
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = THUMBNAIL_WIDTH * state.dpr;
            thumbCanvas.height = THUMBNAIL_WIDTH * B5_ASPECT_RATIO * state.dpr;
            
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCtx.scale(state.dpr, state.dpr);

            // サムネイル描画 (簡易版)
            const scale = THUMBNAIL_WIDTH / (page.frame.w + PAGE_FRAME_PADDING * 2);
            thumbCtx.save();
            thumbCtx.scale(scale, scale);
            thumbCtx.fillStyle = 'white';
            thumbCtx.fillRect(0, 0, thumbCanvas.width / scale / state.dpr, thumbCanvas.height / scale / state.dpr);
            
            drawPageFrame(page, thumbCtx);
            drawKoma(page, thumbCtx, false); // ガイド線
            drawBubbles(page, thumbCtx);
            thumbCtx.restore();

            const pageNum = document.createElement('span');
            pageNum.className = 'page-number';
            pageNum.textContent = index + 1;

            thumb.appendChild(thumbCanvas);
            thumb.appendChild(pageNum);

            thumb.addEventListener('click', () => {
                switchPage(index);
            });
            pagestrip.appendChild(thumb);
        });

        // アクティブなサムネイルが表示されるようにスクロール
        const activeThumb = pagestrip.querySelector('.active');
        if (activeThumb) {
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    // --- 描画 (メイン) ---
    function render() {
        const page = getCurrentPage();
        if (!page) return;
        
        // キャンバスのCSSサイズを取得
        const cssWidth = canvas.clientWidth;
        const cssHeight = canvas.clientHeight;

        ctx.save();
        // 高解像度対応のためのスケールリセット（resizeCanvasで実行済みだが念のため）
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

        // クリア
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        // ページ描画
        drawPageFrame(page, ctx);
        drawKoma(page, ctx, false); // false = ガイド線モード
        drawBubbles(page, ctx);
        drawSelection(page, ctx);

        ctx.restore();
    }
    
    // 描画ヘルパー: 外枠
    function drawPageFrame(page, context) {
        if (!page.frame) return;
        const { x, y, w, h } = page.frame;
        context.strokeStyle = 'black';
        context.lineWidth = 2;
        context.strokeRect(x, y, w, h);
    }

    // 描画ヘルパー: コマ (ガター)
    function drawKoma(page, context, isExport = false) {
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;

        page.gutters.forEach(gutter => {
            const { dir, pos, bounds } = gutter;
            
            // boundsがpage.frameの範囲を超えないようにクリップ
            const clipX = Math.max(fx, bounds.x);
            const clipY = Math.max(fy, bounds.y);
            const clipW = Math.min(fx + fw, bounds.x + bounds.w) - clipX;
            const clipH = Math.min(fy + fh, bounds.y + bounds.h) - clipY;

            if (clipW <= 0 || clipH <= 0) return;

            if (isExport) {
                // 書き出し時: 白溝 + 黒線
                const gutterWidth = (dir === 'h') ? GUTTER_H : GUTTER_V;
                const halfGutter = gutterWidth / 2;

                // 1. 白溝
                context.fillStyle = 'white';
                if (dir === 'h') {
                    context.fillRect(clipX, pos - halfGutter, clipW, gutterWidth);
                } else {
                    context.fillRect(pos - halfGutter, clipY, gutterWidth, clipH);
                }
                
                // 2. 黒線 (両側)
                context.strokeStyle = 'black';
                context.lineWidth = 1;
                context.beginPath();
                if (dir === 'h') {
                    context.moveTo(clipX, pos - halfGutter);
                    context.lineTo(clipX + clipW, pos - halfGutter);
                    context.moveTo(clipX, pos + halfGutter);
                    context.lineTo(clipX + clipW, pos + halfGutter);
                } else {
                    context.moveTo(pos - halfGutter, clipY);
                    context.lineTo(pos - halfGutter, clipY + clipH);
                    context.moveTo(pos + halfGutter, clipY);
                    context.lineTo(pos + halfGutter, clipY + clipH);
                }
                context.stroke();

            } else {
                // エディタ上: ガイド用の細線
                context.strokeStyle = '#888';
                context.lineWidth = 0.5;
                context.setLineDash([4, 2]);
                context.beginPath();
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
        });
    }

    // 描画ヘルパー: フキダシ
    function drawBubbles(page, context) {
        page.bubbles.forEach(bubble => {
            if (state.selectedBubbleId === bubble.id && bubbleEditor.style.display === 'block') {
                // 編集中はキャンバスに描画しない (TextAreaに任せる)
                return;
            }
            drawSingleBubble(bubble, context);
        });
    }

    // 描画ヘルパー: 個々のフキダシ (テキスト含む)
    function drawSingleBubble(bubble, context) {
        const { x, y, w, h, shape, text, font } = bubble;
        const radius = 10; // ギザや四角用

        context.save();
        context.translate(x, y); // 中心座標に移動

        // 1. フキダシの形状
        context.fillStyle = 'white';
        context.strokeStyle = 'black';
        context.lineWidth = 2;

        context.beginPath();
        switch (shape) {
            case 'rect':
                context.rect(-w / 2, -h / 2, w, h);
                break;
            case 'saw': // ギザ (荒めの角丸で代用)
                // 簡易ギザ（角丸多角形）
                context.moveTo(-w/2 + radius, -h/2);
                context.lineTo(w/2 - radius, -h/2);
                context.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + radius);
                context.lineTo(w/2, h/2 - radius);
                context.quadraticCurveTo(w/2, h/2, w/2 - radius, h/2);
                context.lineTo(-w/2 + radius, h/2);
                context.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - radius);
                context.lineTo(-w/2, -h/2 + radius);
                context.quadraticCurveTo(-w/2, -h/2, -w/2 + radius, -h/2);
                break;
            case 'ellipse':
            default:
                context.ellipse(0, 0, w / 2, h / 2, 0, 0, 2 * Math.PI);
                break;
        }
        context.closePath();
        context.fill();
        context.stroke();

        // 2. テキスト描画
        context.fillStyle = 'black';
        context.font = `${font}px 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif`;
        context.textAlign = 'left';
        context.textBaseline = 'top';

        const lines = text.split('\n');
        const lineHeight = font * BUBBLE_LINE_HEIGHT;
        const startY = -h / 2 + BUBBLE_PADDING_Y;
        const startX = -w / 2 + BUBBLE_PADDING_X;

        lines.forEach((line, index) => {
            context.fillText(line, startX, startY + index * lineHeight);
        });

        context.restore();
    }

    // 描画ヘルパー: 選択枠
    function drawSelection(page, context) {
        const bubble = getSelectedBubble();
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
    }

    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        window.addEventListener('resize', resizeCanvas);
        
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

        // キャンバス (Pointer Eventsでマウスとタッチ両対応)
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);

        // キーボード
        window.addEventListener('keydown', onKeyDown);

        // 選択パネル
        shapeEllipse.addEventListener('click', () => setBubbleShape('ellipse'));
        shapeRect.addEventListener('click', () => setBubbleShape('rect'));
        shapeSaw.addEventListener('click', () => setBubbleShape('saw'));
        deleteBubble.addEventListener('click', deleteSelectedBubble);

        // テキストエディタ
        bubbleEditor.addEventListener('input', onBubbleEditorInput);
        bubbleEditor.addEventListener('blur', hideBubbleEditor);
        bubbleEditor.addEventListener('keydown', onBubbleEditorKeyDown);
    }
    
    // --- ツール切り替え ---
    function setTool(toolName) {
        state.currentTool = toolName;
        state.selectedBubbleId = null;
        updateUI();
        render();
    }

    // --- フォントサイズ更新 ---
    function updateFontSize(e) {
        const newSize = parseInt(e.target.value, 10);
        state.defaultFontSize = newSize;
        fontSizeValue.textContent = `${newSize}px`;

        const selectedBubble = getSelectedBubble();
        if (selectedBubble) {
            selectedBubble.font = newSize;
            measureBubbleSize(selectedBubble);
            // 編集中ならエディタのフォントも更新
            if (bubbleEditor.style.display === 'block') {
                bubbleEditor.style.fontSize = `${newSize}px`;
                bubbleEditor.style.lineHeight = `${BUBBLE_LINE_HEIGHT}`;
                updateBubbleEditorPosition(selectedBubble);
            }
            saveAndRender();
        }
    }

    // --- キャンバスイベント ---
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return { x, y };
    }

    function onPointerDown(e) {
        const { x, y } = getCanvasCoords(e);
        const page = getCurrentPage();
        if (!page) return;

        if (state.currentTool === 'serif') {
            // セリフモード: フキダシのヒットテスト
            const clickedBubble = findBubbleAt(page, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
                showBubbleEditor(clickedBubble);
            } else {
                // 新規作成
                const newBubble = createBubble(x, y);
                state.selectedBubbleId = newBubble.id;
                showBubbleEditor(newBubble);
            }
        } else if (state.currentTool === 'koma') {
            // コマモード: ドラッグ開始
            isDragging = true;
            dragStartX = x;
            dragStartY = y;
            state.selectedBubbleId = null; // コマ操作中はフキダシ選択解除
        } else {
            // 選択モード (デフォルト)
            const clickedBubble = findBubbleAt(page, x, y);
            state.selectedBubbleId = clickedBubble ? clickedBubble.id : null;
        }
        
        updateUI();
        render();
    }

    function onPointerMove(e) {
        if (!isDragging || state.currentTool !== 'koma') return;
        
        // TODO: ドラッグ中のガイド線描画 (現状はUP時のみ)
        // render()内でドラッグ中の線を描画するロジックを追加できる
    }

    function onPointerUp(e) {
        if (!isDragging || state.currentTool !== 'koma') {
            isDragging = false;
            return;
        }

        isDragging = false;
        const { x, y } = getCanvasCoords(e);
        addKomaLine(dragStartX, dragStartY, x, y);
        saveAndRender();
    }
    
    // --- キーボードイベント ---
    function onKeyDown(e) {
        // Esc: 選択解除
        if (e.key === 'Escape') {
            if (bubbleEditor.style.display === 'block') {
                bubbleEditor.blur(); // エディタを非表示に
            } else {
                state.selectedBubbleId = null;
                updateUI();
                render();
            }
        }
        
        // S: セリフモード
        if (e.key === 's' && !e.metaKey && !e.ctrlKey && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            setTool('serif');
        }
        // K: コマモード
        if (e.key === 'k' && !e.metaKey && !e.ctrlKey && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            setTool('koma');
        }
    }

    // --- ページ管理ロジック ---
    function getCurrentPage() {
        return state.pages[state.currentPageIndex] || null;
    }

    function createNewPage() {
        const id = `page_${Date.now()}`;
        // キャンバスサイズからframeを計算
        const cssWidth = canvas.clientWidth || 300; // 初期値
        const cssHeight = cssWidth * B5_ASPECT_RATIO;
        
        const page = {
            id: id,
            frame: { 
                x: PAGE_FRAME_PADDING, 
                y: PAGE_FRAME_PADDING, 
                w: cssWidth - PAGE_FRAME_PADDING * 2, 
                h: cssHeight - PAGE_FRAME_PADDING * 2 
            },
            gutters: [],
            bubbles: []
        };
        return page;
    }

    function addPage(before = false) {
        const newPage = createNewPage();
        const newIndex = state.currentPageIndex + (before ? 0 : 1);
        state.pages.splice(newIndex, 0, newPage);
        state.currentPageIndex = newIndex;
        
        state.selectedBubbleId = null;
        saveState();
        resizeCanvas(); // 新しいページのframeを正しく設定
        updateUI();
        // render() は resizeCanvas() が呼ぶ
    }

    function deletePage() {
        if (state.pages.length <= 1) {
            // 最後の1ページはリセット
            state.pages[0] = createNewPage();
            state.currentPageIndex = 0;
            resizeCanvas(); // frameリセット
        } else {
            state.pages.splice(state.currentPageIndex, 1);
            if (state.currentPageIndex >= state.pages.length) {
                state.currentPageIndex = state.pages.length - 1;
            }
        }
        
        state.selectedBubbleId = null;
        saveState();
        updateUI();
        render();
    }

    function switchPage(index) {
        if (index < 0 || index >= state.pages.length) return;
        state.currentPageIndex = index;
        state.selectedBubbleId = null;
        
        // ページ切り替え時にframeサイズを再計算（ロード時とウィンドウサイズが違う場合対策）
        resizeCanvas(); 
        
        updateUI();
        // render()はresizeCanvasが呼ぶ
    }

    // --- セリフ (フキダシ) ロジック ---

    function createBubble(x, y) {
        const page = getCurrentPage();
        const bubble = {
            id: `bubble_${Date.now()}`,
            x: x, // 中心X
            y: y, // 中心Y
            w: 100, // 仮の幅
            h: 50,  // 仮の高さ
            text: "セリフ",
            shape: 'ellipse',
            font: state.defaultFontSize
        };
        measureBubbleSize(bubble); // テキストからサイズを計算
        page.bubbles.push(bubble);
        return bubble;
    }

    function findBubbleAt(page, x, y) {
        // 逆順で検索（描画順が上のものを優先）
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
        // 既存の選択を解除
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
        render(); // 選択枠描画のため
    }
    
    function updateBubbleEditorPosition(bubble) {
        const canvasRect = canvas.getBoundingClientRect();
        
        // bubbleの座標 (中心) をCanvasのCSS座標に変換
        const editorWidth = bubble.w;
        const editorHeight = bubble.h;

        bubbleEditor.style.width = `${editorWidth}px`;
        bubbleEditor.style.height = `${editorHeight}px`;
        bubbleEditor.style.left = `${canvasRect.left + bubble.x - editorWidth / 2}px`;
        bubbleEditor.style.top = `${canvasRect.top + bubble.y - editorHeight / 2}px`;
    }

    function hideBubbleEditor() {
        if (bubbleEditor.style.display === 'block') {
            bubbleEditor.style.display = 'none';
            const bubble = getSelectedBubble();
            if (bubble) {
                // テキストが空なら削除
                if (bubble.text.trim() === "") {
                    deleteSelectedBubble(); // この中で saveAndRender が呼ばれる
                    state.selectedBubbleId = null;
                } else {
                    saveAndRender();
                }
            }
        }
        // state.selectedBubbleId = null; // blur時にすぐnullにすると選択パネルが使えない
        // -> Escキーまたはキャンバスクリックで解除する
    }

    function onBubbleEditorInput(e) {
        const bubble = getSelectedBubble();
        if (bubble) {
            bubble.text = e.target.value;
            // テキストに合わせてフキダシサイズを即時更新
            measureBubbleSize(bubble);
            updateBubbleEditorPosition(bubble);
            // レンダリングはしない（編集中はTextAreaが上にあるため）
        }
    }
    
    function onBubbleEditorKeyDown(e) {
        // Enterのみ改行 (Shift+Enter や Ctrl+Enter ではない)
        // (TextAreaのデフォルト動作がEnter改行なので、特に何もしない)
        
        // Escキーでの終了 (blur) はグローバルのonKeyDownで処理
    }

    // テキストからフキダシの最適サイズを計算
    function measureBubbleSize(bubble) {
        // 描画コンテキストで文字幅を測定
        ctx.save();
        ctx.font = `${bubble.font}px 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif`;
        
        const lines = bubble.text.split('\n');
        let maxWidth = 0;
        
        lines.forEach(line => {
            const metrics = ctx.measureText(line);
            if (metrics.width > maxWidth) {
                maxWidth = metrics.width;
            }
        });
        
        ctx.restore();

        const lineHeight = bubble.font * BUBBLE_LINE_HEIGHT;
        const totalHeight = lines.length * lineHeight;

        bubble.w = maxWidth + BUBBLE_PADDING_X * 2;
        bubble.h = totalHeight + BUBBLE_PADDING_Y * 2;
    }

    function getSelectedBubble() {
        if (!state.selectedBubbleId) return null;
        const page = getCurrentPage();
        return page.bubbles.find(b => b.id === state.selectedBubbleId) || null;
    }

    function deleteSelectedBubble() {
        const page = getCurrentPage();
        if (!page || !state.selectedBubbleId) return;
        
        page.bubbles = page.bubbles.filter(b => b.id !== state.selectedBubbleId);
        state.selectedBubbleId = null;
        
        hideBubbleEditor();
        updateUI(); // 選択パネルを消す
        saveAndRender();
    }

    function setBubbleShape(shape) {
        const bubble = getSelectedBubble();
        if (bubble) {
            bubble.shape = shape;
            saveAndRender();
        }
    }


    // --- コマ割りロジック ---

    // (x, y) が含まれるコマの境界 (frameまたはガター) を返す
    function findKomaAt(page, x, y) {
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;
        let bounds = { x: fx, y: fy, w: fw, h: fh }; // 初期はページ内枠全体

        // すべてのガターをチェックし、(x, y) が含まれる最も内側の矩形を探す
        page.gutters.forEach(gutter => {
            const { dir, pos, bounds: gutterBounds } = gutter;

            // (x,y) が現在のコマ(bounds)内にあるかチェック
            if (x >= bounds.x && x <= bounds.x + bounds.w && 
                y >= bounds.y && y <= bounds.y + bounds.h) {
                
                // ガターが現在のコマ(bounds)と交差するかチェック
                // (簡易的に、ガターのboundsが現在のbounds内に部分的にも含まれるか)
                const intersects = !(
                    gutterBounds.x > bounds.x + bounds.w ||
                    gutterBounds.x + gutterBounds.w < bounds.x ||
                    gutterBounds.y > bounds.y + bounds.h ||
                    gutterBounds.y + gutterBounds.h < bounds.y
                );

                if (!intersects) return;

                // (x, y) がガターのどちら側にあるかで、コマを狭める
                if (dir === 'h' && y >= gutterBounds.y && y <= gutterBounds.y + gutterBounds.h) {
                    if (y > pos) { // 下
                        const newY = pos + GUTTER_H / 2;
                        bounds.h = (bounds.y + bounds.h) - newY;
                        bounds.y = newY;
                    } else { // 上
                        bounds.h = (pos - GUTTER_H / 2) - bounds.y;
                    }
                } else if (dir === 'v' && x >= gutterBounds.x && x <= gutterBounds.x + gutterBounds.w) {
                    if (x > pos) { // 右
                        const newX = pos + GUTTER_V / 2;
                        bounds.w = (bounds.x + bounds.w) - newX;
                        bounds.x = newX;
                    } else { // 左
                        bounds.w = (pos - GUTTER_V / 2) - bounds.x;
                    }
                }
            }
        });
        
        // 最終的なboundsをクリッピング
        bounds.w = Math.min(bounds.x + bounds.w, fx + fw) - bounds.x;
        bounds.h = Math.min(bounds.y + bounds.h, fy + fh) - bounds.y;
        
        return bounds;
    }

    function addKomaLine(x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI; // -180 〜 180

        let dir = null;
        let pos = 0;

        // 角度をスナップ
        // 0°付近 (水平)
        if (Math.abs(angle) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle) >= 180 - SNAP_ANGLE_THRESHOLD) {
            dir = 'h';
            pos = y1; // 基準点のY
        }
        // 90°付近 (垂直)
        else if (Math.abs(angle - 90) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle + 90) <= SNAP_ANGLE_THRESHOLD) {
            dir = 'v';
            pos = x1; // 基準点のX
        }
        // それ以外 (近い軸に丸める)
        else {
            if (Math.abs(dx) > Math.abs(dy)) {
                dir = 'h'; // 水平に近い
                pos = y1;
            } else {
                dir = 'v'; // 垂直に近い
                pos = x1;
            }
        }

        // 基準点 (x1, y1) が含まれるコマを特定
        const komaBounds = findKomaAt(page, x1, y1);

        // ガターを追加
        page.gutters.push({
            dir: dir,
            pos: pos,
            bounds: komaBounds // このガターが有効な範囲
        });
    }

    // --- テキスト入出力 ---

    function exportText() {
        textIO.value = formatTextExport(state.pages);
        textIO.style.display = 'block'; // 一瞬表示
        textIO.select();
        try {
            document.execCommand('copy');
            alert('全ページのテキストをコピーしました。');
        } catch (e) {
            alert('コピーに失敗しました。手動でコピーしてください。');
        }
        textIO.style.display = 'none'; // すぐ隠す
    }

    function importText() {
        const text = prompt('テキストをペーストしてください（現在のページ以降が上書きされます）');
        if (text === null) return; // キャンセル

        const pagesData = parseTextImport(text);

        if (pagesData.length === 0) return;

        // 現在のページから差し替え
        let insertIndex = state.currentPageIndex;
        
        pagesData.forEach((pageContent, i) => {
            let page;
            if (insertIndex < state.pages.length) {
                // 既存ページを上書き（フキダシのみリセット）
                page = state.pages[insertIndex];
                page.bubbles = [];
            } else {
                // 新規ページ追加
                page = createNewPage();
                state.pages.push(page);
            }
            
            // フキダシをグリッド配置
            const { w: fw, h: fh } = page.frame;
            const startX = page.frame.x + fw; // 右から
            const startY = page.frame.y + 30; // 上から
            const colWidth = fw / 3; // 簡易的に3列
            
            let currentX = startX - colWidth / 2;
            let currentY = startY;

            pageContent.bubbles.forEach((text, bubbleIndex) => {
                const bubble = {
                    id: `bubble_import_${Date.now()}_${i}_${bubbleIndex}`,
                    x: currentX,
                    y: currentY,
                    w: 0, h: 0, // measureBubbleSizeで設定
                    text: text,
                    shape: 'ellipse',
                    font: state.defaultFontSize
                };
                measureBubbleSize(bubble);
                page.bubbles.push(bubble);
                
                // 次の位置へ (左へ)
                currentX -= colWidth;
                if (currentX < page.frame.x) {
                    // 次の行へ
                    currentX = startX - colWidth / 2;
                    currentY += 100; // 適当な行間
                }
            });
            
            insertIndex++;
        });

        // ページが自動追加された場合、最後のページに移動
        state.currentPageIndex = Math.min(insertIndex - 1, state.pages.length - 1);

        saveState();
        resizeCanvas(); // frame設定のため
        updateUI();
    }
    
    // エクスポート用フォーマッタ
    function formatTextExport(pages) {
        let output = "";
        pages.forEach((page, pageIndex) => {
            // ページ内のフキダシをソート (右→左、上→下)
            const sortedBubbles = [...page.bubbles].sort((a, b) => {
                if (Math.abs(a.y - b.y) < 30) { // ほぼ同じ高さ
                    return b.x - a.x; // 右 (X大) が先
                }
                return a.y - b.y; // 上 (Y小) が先
            });

            sortedBubbles.forEach((bubble, bubbleIndex) => {
                output += bubble.text;
                if (bubbleIndex < sortedBubbles.length - 1) {
                    output += "\n\n"; // フキダシ間は空行1
                }
            });

            if (pageIndex < pages.length - 1) {
                output += "\n\n\n"; // ページ間は空行2 (改行3つ)
            }
        });
        return output;
    }

    // インポート用パーサー
    function parseTextImport(text) {
        // \rを削除
        const cleanedText = text.replace(/\r/g, '');
        
        // 空行2以上 (改行3つ以上) でページ分割
        const pageStrings = cleanedText.split(/\n{3,}/);
        
        return pageStrings.map(pageStr => {
            // 空行1 (改行2つ) でフキダシ分割
            const bubbleStrings = pageStr.split(/\n{2,}/)
                                       .map(s => s.trim())
                                       .filter(s => s.length > 0);
            return {
                bubbles: bubbleStrings
            };
        });
    }

    // --- 書き出し (PNG / ZIP) ---

    // 高解像度で1ページを描画するオフスクリーンCanvasを作成
    function renderPageToCanvas(page, renderDPR = 2) {
        const baseWidth = 1000; // 書き出し時の基準幅 (B5比率にする)
        const baseHeight = baseWidth * B5_ASPECT_RATIO;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = baseWidth * renderDPR;
        offCanvas.height = baseHeight * renderDPR;
        const offCtx = offCanvas.getContext('2d');
        
        offCtx.scale(renderDPR, renderDPR);

        // メインキャンバスの描画ロジックを、オフスクリーン用にスケール変換して実行
        const scaleX = baseWidth / (page.frame.w + PAGE_FRAME_PADDING * 2);
        const scaleY = baseHeight / (page.frame.h + PAGE_FRAME_PADDING * 2);

        offCtx.save();
        offCtx.scale(scaleX, scaleY);

        // 1. 白背景
        offCtx.fillStyle = 'white';
        offCtx.fillRect(0, 0, offCanvas.width / scaleX / renderDPR, offCanvas.height / scaleY / renderDPR);

        // 2. 外枠
        drawPageFrame(page, offCtx);
        // 3. コマ (書き出しモード)
        drawKoma(page, offCtx, true);
        // 4. フキダシ
        page.bubbles.forEach(bubble => {
            drawSingleBubble(bubble, offCtx);
        });

        offCtx.restore();
        
        return offCanvas;
    }

    function exportPNG() {
        const page = getCurrentPage();
        if (!page) return;

        const offCanvas = renderPageToCanvas(page, state.dpr); // 端末の解像度に合わせる
        
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
            const offCanvas = renderPageToCanvas(page, 2); // ZIP時はDPR=2で固定
            
            const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
            zip.file(`page_${String(i + 1).padStart(3, '0')}.png`, blob);
        }
        
        zip.generateAsync({ type: 'blob' })
            .then(content => {
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'manganame.zip';
                a.click();
                URL.revokeObjectURL(url);
            });
    }

    // --- 汎用ヘルパー ---
    function saveAndRender() {
        saveState();
        render();
    }

    // --- 初期化実行 ---
    init();
});