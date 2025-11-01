document.addEventListener('DOMContentLoaded', () => {

    // --- 定数 ---
    const STORAGE_KEY = 'manganame_v3';
    const B5_ASPECT_RATIO = Math.sqrt(2); // 縦/横 ≈ 1.414
    const PAGE_FRAME_PADDING = 15; // キャンバス端から内枠までの余白
    const GUTTER_H = 18; // 横ガター幅
    const GUTTER_V = 9;  // 縦ガター幅
    const BUBBLE_PADDING_X = 10; // 縦書きの左右余白
    const BUBBLE_PADDING_Y = 8;  // 縦書きの上下余白
    const BUBBLE_LINE_HEIGHT = 1.2; // 文字サイズに対する行間 (縦書きでは列間)
    const SNAP_ANGLE_THRESHOLD = 15; // 角度スナップの閾値 (度)
    const THUMBNAIL_WIDTH = (60 - 12) / B5_ASPECT_RATIO;

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
    const selectionPanelBubble = document.getElementById('selectionPanelBubble');
    const shapeEllipse = document.getElementById('shapeEllipse');
    const shapeRect = document.getElementById('shapeRect');
    const shapeSaw = document.getElementById('shapeSaw');
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
        currentTool: null, // 'serif', 'koma', or null (選択モード)
        defaultFontSize: 16,
        selectedBubbleId: null,
        selectedGutterId: null, // [追加] 選択中のコマ枠ID
        scale: 1.0, 
        dpr: window.devicePixelRatio || 1,
    };

    // ドラッグ状態
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragCurrentX = 0; // [追加] ドラッグ中の現在位置
    let dragCurrentY = 0; // [追加] ドラッグ中の現在位置

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

        if (containerWidth / containerHeight > 1 / B5_ASPECT_RATIO) {
            canvasCssHeight = containerHeight;
            canvasCssWidth = containerHeight / B5_ASPECT_RATIO;
        } else {
            canvasCssWidth = containerWidth;
            canvasCssHeight = containerWidth * B5_ASPECT_RATIO;
        }

        canvas.style.width = `${canvasCssWidth}px`;
        canvas.style.height = `${canvasCssHeight}px`;

        canvas.width = Math.round(canvasCssWidth * state.dpr);
        canvas.height = Math.round(canvasCssHeight * state.dpr);

        ctx.scale(state.dpr, state.dpr);

        state.scale = canvas.width / canvasCssWidth / state.dpr; 
        
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
        // [修正] ツールトグル (両方オフを許可)
        btnSerif.classList.toggle('active', state.currentTool === 'serif');
        btnKoma.classList.toggle('active', state.currentTool === 'koma');

        // [修正] カーソル制御
        canvas.classList.remove('tool-serif', 'tool-koma');
        if (state.currentTool === 'serif') {
            canvas.classList.add('tool-serif');
        } else if (state.currentTool === 'koma') {
            canvas.classList.add('tool-koma');
        }

        // [修正] 選択パネル (フキダシ)
        const selectedBubble = getSelectedBubble();
        selectionPanelBubble.classList.toggle('show', !!selectedBubble);
        if (selectedBubble) {
            const canvasRect = canvas.getBoundingClientRect();
            selectionPanelBubble.style.bottom = `${window.innerHeight - canvasRect.bottom + 10}px`;
        }
        
        // [追加] 選択パネル (コマ枠)
        const selectedGutter = getSelectedGutter();
        selectionPanelGutter.classList.toggle('show', !!selectedGutter);
        if (selectedGutter) {
            const canvasRect = canvas.getBoundingClientRect();
            selectionPanelGutter.style.bottom = `${window.innerHeight - canvasRect.bottom + 10}px`;
        }

        // テキストエディタ
        if (!selectedBubble) {
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

        const activeThumb = pagestrip.querySelector('.active');
        if (activeThumb) {
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    // --- 描画 (メイン) ---
    function render() {
        const page = getCurrentPage();
        if (!page) return;
        
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
        
        // [追加] ドラッグ中のコマ枠ガイド線を描画
        if (isDragging && state.currentTool === 'koma') {
            drawDragKomaLine(ctx, dragStartX, dragStartY, dragCurrentX, dragCurrentY);
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

    // 描画ヘルパー: コマ (ガター)
    function drawKoma(page, context, isExport = false) {
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;

        page.gutters.forEach(gutter => {
            const { dir, pos, bounds } = gutter;
            
            const clipX = Math.max(fx, bounds.x);
            const clipY = Math.max(fy, bounds.y);
            const clipW = Math.min(fx + fw, bounds.x + bounds.w) - clipX;
            const clipH = Math.min(fy + fh, bounds.y + bounds.h) - clipY;

            if (clipW <= 0 || clipH <= 0) return;

            if (isExport) {
                // 書き出し時: 白溝 + 黒線
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
                // [修正] エディタ上: 黒の点線
                context.strokeStyle = 'black'; // [修正]
                context.lineWidth = 1;       // [修正]
                context.setLineDash([2, 2]); // [修正]
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

    // [追加] ドラッグ中のコマ枠ガイド線
    function drawDragKomaLine(context, x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;
        
        // 角度判定
        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        
        // 描画範囲 (基準点が含まれるコマ)
        const komaBounds = findKomaAt(page, x1, y1);
        const clipX = komaBounds.x;
        const clipY = komaBounds.y;
        const clipW = komaBounds.w;
        const clipH = komaBounds.h;

        context.strokeStyle = '#007bff'; // ドラッグ中は青
        context.lineWidth = 1;
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


    // 描画ヘルパー: フキダシ
    function drawBubbles(page, context) {
        page.bubbles.forEach(bubble => {
            if (state.selectedBubbleId === bubble.id && bubbleEditor.style.display === 'block') {
                return;
            }
            drawSingleBubble(bubble, context);
        });
    }

    // [大幅修正] 描画ヘルパー: 個々のフキダシ (縦書き対応)
    function drawSingleBubble(bubble, context) {
        const { x, y, w, h, shape, text, font } = bubble;
        const radius = 10; 

        context.save();
        context.translate(x, y); 

        // 1. フキダシの形状
        context.fillStyle = 'white';
        context.strokeStyle = 'black';
        context.lineWidth = 2;

        context.beginPath();
        switch (shape) {
            case 'rect':
                context.rect(-w / 2, -h / 2, w, h);
                break;
            case 'saw': 
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

        // 2. テキスト描画 (縦書き)
        context.fillStyle = 'black';
        context.font = `${font}px 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif`;
        context.textAlign = 'center'; // 縦書きなので中央揃え
        context.textBaseline = 'top';

        const lines = text.split('\n');
        const columnWidth = font * BUBBLE_LINE_HEIGHT; // 1列の幅
        const charHeight = font * BUBBLE_LINE_HEIGHT;  // 1文字の高さ（行間含む）

        // 開始位置 (右上が基準)
        let currentX = (w / 2) - BUBBLE_PADDING_X - (columnWidth / 2);
        const startY = (-h / 2) + BUBBLE_PADDING_Y;

        lines.forEach((line) => {
            let currentY = startY;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                // TODO: 縦中横 (数字など) の処理は未対応
                context.fillText(char, currentX, currentY);
                currentY += charHeight * 0.9; // 若干詰める
            }
            currentX -= columnWidth; // 次の列へ (左へ)
        });

        context.restore();
    }

    // 描画ヘルパー: 選択枠
    function drawSelection(page, context) {
        // フキダシ
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
        
        // [追加] コマ枠
        const gutter = getSelectedGutter();
        if(gutter) {
            const { dir, pos, bounds } = gutter;
            context.strokeStyle = '#007bff'; // 選択色
            context.lineWidth = 4; // 太く
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

        // キャンバス (Pointer Events)
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);

        // キーボード
        window.addEventListener('keydown', onKeyDown);

        // 選択パネル (フキダシ)
        shapeEllipse.addEventListener('click', () => setBubbleShape('ellipse'));
        shapeRect.addEventListener('click', () => setBubbleShape('rect'));
        shapeSaw.addEventListener('click', () => setBubbleShape('saw'));
        deleteBubble.addEventListener('click', deleteSelectedBubble);
        
        // [追加] 選択パネル (コマ枠)
        deleteGutter.addEventListener('click', deleteSelectedGutter);

        // テキストエディタ
        bubbleEditor.addEventListener('input', onBubbleEditorInput);
        bubbleEditor.addEventListener('blur', hideBubbleEditor);
        bubbleEditor.addEventListener('keydown', onBubbleEditorKeyDown);
    }
    
    // [修正] ツール切り替え (トグル式)
    function setTool(toolName) {
        // 既に選択されているツールを再度クリックしたら、選択解除
        if (state.currentTool === toolName) {
            state.currentTool = null;
        } else {
            state.currentTool = toolName;
        }
        
        // ツール変更時は選択解除
        state.selectedBubbleId = null;
        state.selectedGutterId = null;
        
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

        // 他の選択を解除
        state.selectedBubbleId = null;
        state.selectedGutterId = null;

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
            // コマモード: [追加] まずガター（コマ枠）のヒットテスト
            const clickedGutter = findGutterAt(page, x, y);
            if (clickedGutter) {
                state.selectedGutterId = clickedGutter.id;
            } else {
                // ガターがヒットしなかったらドラッグ開始
                isDragging = true;
                dragStartX = x;
                dragStartY = y;
                dragCurrentX = x;
                dragCurrentY = y;
            }
        } else {
            // 選択モード (ツールがnull)
            const clickedBubble = findBubbleAt(page, x, y);
            if (clickedBubble) {
                state.selectedBubbleId = clickedBubble.id;
            }
        }
        
        updateUI();
        render();
    }

    function onPointerMove(e) {
        if (!isDragging || state.currentTool !== 'koma') return;
        
        const { x, y } = getCanvasCoords(e);
        dragCurrentX = x;
        dragCurrentY = y;
        
        // [修正] ドラッグ中のガイド線を描画するために再描画
        render();
    }

    function onPointerUp(e) {
        if (!isDragging || state.currentTool !== 'koma') {
            isDragging = false;
            return;
        }

        isDragging = false;
        const { x, y } = getCanvasCoords(e);
        addKomaLine(dragStartX, dragStartY, x, y);
        saveAndRender(); // render()はここで呼ばれる
    }
    
    // --- キーボードイベント ---
    function onKeyDown(e) {
        // [修正] IMEがオンでも動作するように e.code を見る
        const keyCode = e.code; 

        // Esc: 選択解除
        if (keyCode === 'Escape') {
            if (bubbleEditor.style.display === 'block') {
                bubbleEditor.blur(); 
            } else {
                state.selectedBubbleId = null;
                state.selectedGutterId = null;
                updateUI();
                render();
            }
        }
        
        // ショートカットキー (入力中以外)
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            return;
        }

        // S: セリフモード
        if (keyCode === 'KeyS' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setTool('serif');
        }
        // K: コマモード
        if (keyCode === 'KeyK' && !e.metaKey && !e.ctrlKey) {
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
        const cssWidth = canvas.clientWidth || 300; 
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
        state.selectedGutterId = null;
        saveState();
        resizeCanvas(); 
        updateUI();
    }

    function deletePage() {
        if (state.pages.length <= 1) {
            state.pages[0] = createNewPage();
            state.currentPageIndex = 0;
            resizeCanvas();
        } else {
            state.pages.splice(state.currentPageIndex, 1);
            if (state.currentPageIndex >= state.pages.length) {
                state.currentPageIndex = state.pages.length - 1;
            }
        }
        
        state.selectedBubbleId = null;
        state.selectedGutterId = null;
        saveState();
        updateUI();
        render();
    }

    function switchPage(index) {
        if (index < 0 || index >= state.pages.length) return;
        state.currentPageIndex = index;
        state.selectedBubbleId = null;
        state.selectedGutterId = null;
        
        resizeCanvas(); 
        updateUI();
    }

    // --- セリフ (フキダシ) ロジック ---

    function createBubble(x, y) {
        const page = getCurrentPage();
        const bubble = {
            id: `bubble_${Date.now()}`,
            x: x, y: y,
            w: 100, h: 50, 
            text: "セリフ",
            shape: 'ellipse',
            font: state.defaultFontSize
        };
        measureBubbleSize(bubble); // テキストからサイズを計算
        page.bubbles.push(bubble);
        return bubble;
    }

    function findBubbleAt(page, x, y) {
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
        render();
    }
    
    // [修正] 縦書き対応
    function updateBubbleEditorPosition(bubble) {
        const canvasRect = canvas.getBoundingClientRect();
        
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
                if (bubble.text.trim() === "") {
                    deleteSelectedBubble(); 
                    state.selectedBubbleId = null;
                } else {
                    saveAndRender();
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

    // [大幅修正] 縦書き用のサイズ測定
    function measureBubbleSize(bubble) {
        const { text, font } = bubble;
        const lines = text.split('\n');
        
        const columnWidth = font * BUBBLE_LINE_HEIGHT; // 1列の幅
        const charHeight = font * BUBBLE_LINE_HEIGHT * 0.9; // 1文字の高さ

        let maxHeight = 0;
        lines.forEach(line => {
            const height = line.length * charHeight;
            if (height > maxHeight) {
                maxHeight = height;
            }
        });
        
        // 最低の高さを確保
        if (maxHeight === 0 && lines.length > 0) {
             maxHeight = charHeight;
        } else if (maxHeight === 0) {
            maxHeight = font; // 1文字分の高さ
        }

        const totalWidth = lines.length * columnWidth;

        bubble.w = totalWidth + BUBBLE_PADDING_X * 2;
        bubble.h = maxHeight + BUBBLE_PADDING_Y * 2;
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
        updateUI();
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

    function findKomaAt(page, x, y) {
        const { x: fx, y: fy, w: fw, h: fh } = page.frame;
        let bounds = { x: fx, y: fy, w: fw, h: fh }; 

        page.gutters.forEach(gutter => {
            const { dir, pos, bounds: gutterBounds } = gutter;

            if (x >= bounds.x && x <= bounds.x + bounds.w && 
                y >= bounds.y && y <= bounds.y + bounds.h) {
                
                const intersects = !(
                    gutterBounds.x > bounds.x + bounds.w ||
                    gutterBounds.x + gutterBounds.w < bounds.x ||
                    gutterBounds.y > bounds.y + bounds.h ||
                    gutterBounds.y + gutterBounds.h < bounds.y
                );

                if (!intersects) return;

                if (dir === 'h' && y >= gutterBounds.y && y <= gutterBounds.y + gutterBounds.h) {
                    if (y > pos) { 
                        const newY = pos + GUTTER_H / 2;
                        bounds.h = (bounds.y + bounds.h) - newY;
                        bounds.y = newY;
                    } else { 
                        bounds.h = (pos - GUTTER_H / 2) - bounds.y;
                    }
                } else if (dir === 'v' && x >= gutterBounds.x && x <= gutterBounds.x + gutterBounds.w) {
                    if (x > pos) { 
                        const newX = pos + GUTTER_V / 2;
                        bounds.w = (bounds.x + bounds.w) - newX;
                        bounds.x = newX;
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

    // 角度と位置を返すヘルパー
    function getKomaSnapDirection(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI; 

        let dir = null;
        let pos = 0;

        if (Math.abs(angle) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle) >= 180 - SNAP_ANGLE_THRESHOLD) {
            dir = 'h';
            pos = y1; 
        }
        else if (Math.abs(angle - 90) <= SNAP_ANGLE_THRESHOLD || Math.abs(angle + 90) <= SNAP_ANGLE_THRESHOLD) {
            dir = 'v';
            pos = x1; 
        }
        else {
            if (Math.abs(dx) > Math.abs(dy)) {
                dir = 'h'; 
                pos = y1;
            } else {
                dir = 'v'; 
                pos = x1;
            }
        }
        return { dir, pos };
    }

    function addKomaLine(x1, y1, x2, y2) {
        const page = getCurrentPage();
        if (!page) return;

        // 線の長さが短すぎる場合は無視
        const dist = Math.hypot(x2 - x1, y2 - y1);
        if (dist < 10) return; // 短いドラッグは無視

        const { dir, pos } = getKomaSnapDirection(x1, y1, x2, y2);
        const komaBounds = findKomaAt(page, x1, y1);

        page.gutters.push({
            id: `gutter_${Date.now()}`, // [追加] ID付与
            dir: dir,
            pos: pos,
            bounds: komaBounds 
        });
    }

    // [追加] コマ枠のヒットテスト
    function findGutterAt(page, x, y) {
        const HIT_THRESHOLD_H = GUTTER_H / 2;
        const HIT_THRESHOLD_V = GUTTER_V / 2 + 5; // 縦は細いので少し広めに

        // 逆順（新しいものが上）で検索
        for (let i = page.gutters.length - 1; i >= 0; i--) {
            const gutter = page.gutters[i];
            const { dir, pos, bounds } = gutter;

            // 1. bounds (コマの矩形) の中に (x,y) があるか
            if (x >= bounds.x && x <= bounds.x + bounds.w &&
                y >= bounds.y && y <= bounds.y + bounds.h) {
                
                // 2. ガターの中心線に近いか
                if (dir === 'h' && Math.abs(y - pos) < HIT_THRESHOLD_H) {
                    return gutter;
                }
                if (dir === 'v' && Math.abs(x - pos) < HIT_THRESHOLD_V) {
                    return gutter;
                }
            }
        }
        return null;
    }

    // [追加]
    function getSelectedGutter() {
        if (!state.selectedGutterId) return null;
        const page = getCurrentPage();
        return page.gutters.find(g => g.id === state.selectedGutterId) || null;
    }
    
    // [追加]
    function deleteSelectedGutter() {
        const page = getCurrentPage();
        if (!page || !state.selectedGutterId) return;
        
        page.gutters = page.gutters.filter(g => g.id !== state.selectedGutterId);
        state.selectedGutterId = null;
        
        updateUI();
        saveAndRender();
    }


    // --- テキスト入出力 --- (縦書きでもロジック変更なし)

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
            }
            
            // [修正] 縦書きグリッド配置 (右→左、上→下)
            const { w: fw, h: fh } = page.frame;
            const startX = page.frame.x + fw - 60; // 右から
            const startY = page.frame.y + 60; // 上から
            const colWidth = 80; // 縦書きの列幅 (適当)
            
            let currentX = startX;
            let currentY = startY;

            pageContent.bubbles.forEach((text, bubbleIndex) => {
                const bubble = {
                    id: `bubble_import_${Date.now()}_${i}_${bubbleIndex}`,
                    x: currentX, y: currentY,
                    w: 0, h: 0, 
                    text: text,
                    shape: 'ellipse',
                    font: state.defaultFontSize
                };
                measureBubbleSize(bubble);
                page.bubbles.push(bubble);
                
                // 次の位置へ (左へ)
                currentX -= (bubble.w + 20); // フキダシ幅 + 余白
                if (currentX < page.frame.x + bubble.w / 2) {
                    // 次の行（下）へ
                    currentX = startX;
                    currentY += 120; // 適当な行間
                }
            });
            
            insertIndex++;
        });

        state.currentPageIndex = Math.min(insertIndex - 1, state.pages.length - 1);

        saveState();
        resizeCanvas();
        updateUI();
    }
    
    function formatTextExport(pages) {
        let output = "";
        pages.forEach((page, pageIndex) => {
            const sortedBubbles = [...page.bubbles].sort((a, b) => {
                if (Math.abs(a.y - b.y) < 30) { 
                    return b.x - a.x; // 右 (X大) が先
                }
                return a.y - b.y; // 上 (Y小) が先
            });

            sortedBubbles.forEach((bubble, bubbleIndex) => {
                output += bubble.text;
                if (bubbleIndex < sortedBubbles.length - 1) {
                    output += "\n\n"; 
                }
            });

            if (pageIndex < pages.length - 1) {
                output += "\n\n\n"; 
            }
        });
        return output;
    }

    function parseTextImport(text) {
        const cleanedText = text.replace(/\r/g, '');
        const pageStrings = cleanedText.split(/\n{3,}/);
        
        return pageStrings.map(pageStr => {
            const bubbleStrings = pageStr.split(/\n{2,}/)
                                       .map(s => s.trim())
                                       .filter(s => s.length > 0);
            return {
                bubbles: bubbleStrings
            };
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

        const scaleX = baseWidth / (page.frame.w + PAGE_FRAME_PADDING * 2);
        const scaleY = baseHeight / (page.frame.h + PAGE_FRAME_PADDING * 2);

        offCtx.save();
        offCtx.scale(scaleX, scaleY);

        offCtx.fillStyle = 'white';
        offCtx.fillRect(0, 0, offCanvas.width / scaleX / renderDPR, offCanvas.height / scaleY / renderDPR);

        drawPageFrame(page, offCtx);
        drawKoma(page, offCtx, true); // true = 書き出しモード
        page.bubbles.forEach(bubble => {
            drawSingleBubble(bubble, offCtx); // 縦書き描画をそのまま使用
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