// pages/cropper/cropper.js
let dpr = 1;

Page({
  data: {
    outputPath: ""
  },

  onLoad() {
    this.initCanvas();
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#editor').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0]) {
        console.error('Canvas node 查询失败');
        return;
      }

      const canvas = res[0].node;
      const width = res[0].width;
      const height = res[0].height;

      this.canvas = canvas;
      // 新版节点 getContext('2d')
      this.ctx = canvas.getContext && canvas.getContext('2d');

      dpr = wx.getSystemInfoSync().pixelRatio || 1;
      // 画布像素尺寸
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      this.viewW = canvas.width;
      this.viewH = canvas.height;

      // 裁剪框：正方形（占可视短边的70%）
      const cropSize = Math.round(Math.min(this.viewW, this.viewH) * 0.7);
      this.crop = {
        x: Math.round((this.viewW - cropSize) / 2),
        y: Math.round((this.viewH - cropSize) / 2),
        size: cropSize,
        radius: Math.round(16 * dpr)
      };

      this.minCropSize = Math.round(80 * dpr);       // 裁剪框最小尺寸
      this.handleRadius = Math.round(14 * dpr);      // 四角手柄半径（用于命中检测）

      // 图像状态（在画布坐标系中）
      this.state = {
        img: null,
        imgW: 0,
        imgH: 0,
        scale: 1,
        minScale: 0.2,
        maxScale: 8,
        tx: 0, // 绘制时的平移（像素）
        ty: 0
      };

      // 手势与交互状态
      this.gesture = {
        touching: false,
        pinching: false,
        lastX: 0,
        lastY: 0,
        lastDist: 0,
        lastCenter: { x: 0, y: 0 },
        startScale: 1
      };

      // 区分交互类型：'panImage' | 'pinchImage' | 'moveCrop' | 'resize' | null
      this.interaction = {
        type: null,
        startX: 0,
        startY: 0,
        startCrop: null,
        corner: -1
      };

      this.draw();
    });
  },

  /**************************
   * 选择图片（保持与新版 Canvas 兼容）
   **************************/
  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFilePaths[0];

        // 优先使用 canvas.createImage（在 Canvas 2D node 上存在）
        let img;
        if (this.canvas && typeof this.canvas.createImage === 'function') {
          img = this.canvas.createImage();
          img.onload = () => {
            this.state.img = img;
            this.state.imgW = img.width;
            this.state.imgH = img.height;
            this.autoFit();
            this.draw();
          };
          img.onerror = (e) => {
            console.error('canvas.createImage 加载失败', e);
          };
          img.src = path;
        } else {
          // 回退：在某些环境下也可能有 Image 全局
          img = new Image();
          img.onload = () => {
            this.state.img = img;
            this.state.imgW = img.width;
            this.state.imgH = img.height;
            this.autoFit();
            this.draw();
          };
          img.onerror = (e) => {
            console.error('Image 加载失败', e);
          };
          img.src = path;
        }
      }
    })
  },

  /**************************
   * 自动适配：让图片覆盖裁剪框
   **************************/
  autoFit() {
    const { imgW, imgH } = this.state;
    if (!imgW || !imgH) return;
    const { size, x, y } = this.crop;
    const scaleToCover = Math.max(size / imgW, size / imgH);
    this.state.scale = scaleToCover;

    const cx = x + size / 2;
    const cy = y + size / 2;
    this.state.tx = Math.round(cx - (imgW * scaleToCover) / 2);
    this.state.ty = Math.round(cy - (imgH * scaleToCover) / 2);

    this._constrain();
  },

  resetView() {
    if (!this.state.img) return;
    this.autoFit();
    this.draw();
  },

  /**************************
   * 触摸事件（支持：四角缩放、框内移动、图片拖拽、双指缩放图片）
   **************************/
  onTouchStart(e) {
    if (!this.state.img) return;
    const touches = e.touches;
    if (touches.length === 1) {
      const x = touches[0].x * dpr;
      const y = touches[0].y * dpr;
      const handle = this._hitHandle(x, y);
      if (handle !== -1) {
        // 开始调整角（resize）
        this.interaction.type = 'resize';
        this.interaction.corner = handle;
        this.interaction.startX = x;
        this.interaction.startY = y;
        this.interaction.startCrop = { ...this.crop };
      } else if (this._pointInRect(x, y, this.crop)) {
        // 移动裁剪框
        this.interaction.type = 'moveCrop';
        this.interaction.startX = x;
        this.interaction.startY = y;
        this.interaction.startCrop = { ...this.crop };
      } else {
        // 单指拖拽图片
        this.interaction.type = 'panImage';
        this.gesture.touching = true;
        this.gesture.lastX = x;
        this.gesture.lastY = y;
      }
    } else if (touches.length === 2) {
      // 双指缩放图片（pinch）
      const p1 = { x: touches[0].x * dpr, y: touches[0].y * dpr };
      const p2 = { x: touches[1].x * dpr, y: touches[1].y * dpr };
      this.gesture.pinching = true;
      this.gesture.lastDist = this._distance(p1, p2);
      this.gesture.lastCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      this.gesture.startScale = this.state.scale;
      this.interaction.type = 'pinchImage';
    }
  },

  onTouchMove(e) {
    if (!this.state.img) return;
    const touches = e.touches;

    // 单指拖动图片（pan）
    if (touches.length === 1 && this.interaction.type === 'panImage' && this.gesture.touching && !this.gesture.pinching) {
      const x = touches[0].x * dpr;
      const y = touches[0].y * dpr;
      const dx = x - this.gesture.lastX;
      const dy = y - this.gesture.lastY;
      this.gesture.lastX = x;
      this.gesture.lastY = y;

      this.state.tx += dx;
      this.state.ty += dy;
      this._constrain();
      this.draw();
      return;
    }

    // 双指放缩图片（pinch）
    if (touches.length === 2 && (this.interaction.type === 'pinchImage' || this.gesture.pinching)) {
      const p1 = { x: touches[0].x * dpr, y: touches[0].y * dpr };
      const p2 = { x: touches[1].x * dpr, y: touches[1].y * dpr };
      const dist = this._distance(p1, p2);
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const newScale = this._clamp(this.gesture.startScale * (dist / this.gesture.lastDist), this.state.minScale, this.state.maxScale);
      const ratio = newScale / this.state.scale;

      const tx = this.state.tx;
      const ty = this.state.ty;
      this.state.tx = center.x - (center.x - tx) * ratio;
      this.state.ty = center.y - (center.y - ty) * ratio;
      this.state.scale = newScale;

      this._constrain();
      this.draw();
      return;
    }

    // 单指移动裁剪框 或 单指调整角
    if (touches.length === 1 && (this.interaction.type === 'moveCrop' || this.interaction.type === 'resize')) {
      const x = touches[0].x * dpr;
      const y = touches[0].y * dpr;

      if (this.interaction.type === 'moveCrop') {
        const dx = x - this.interaction.startX;
        const dy = y - this.interaction.startY;
        const newX = this._clamp(this.interaction.startCrop.x + dx, 0, this.viewW - this.interaction.startCrop.size);
        const newY = this._clamp(this.interaction.startCrop.y + dy, 0, this.viewH - this.interaction.startCrop.size);
        this.crop.x = Math.round(newX);
        this.crop.y = Math.round(newY);
        this._constrain();
        this.draw();
      } else {
        // resize
        this._resizeCrop(this.interaction.corner, x, y);
        this._constrain();
        this.draw();
      }
      return;
    }
  },

  onTouchEnd() {
    this.gesture.touching = false;
    this.gesture.pinching = false;
    this.interaction.type = null;
    this.interaction.corner = -1;
    this.interaction.startCrop = null;
  },

  /**************************
   * 绘制：图片 -> 遮罩 -> 裁剪框边框-> 网格 -> 角点（handle）
   **************************/
  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { img, imgW, imgH, scale, tx, ty } = this.state;
    const { x, y, size, radius } = this.crop;

    // 清屏
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // 画图像（按当前变换）
    if (img) {
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, tx, ty); // 缩放 + 平移
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      try {
        ctx.drawImage(img, 0, 0, imgW, imgH);
      } catch (e) {
        // 有时 devtools 上 drawImage 会抛错（环境差异），记录但不阻塞
        console.warn('drawImage 异常：', e);
      }
      ctx.restore();
    }

    // 遮罩（挖空裁剪区）
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.globalCompositeOperation = 'destination-out';
    this._roundRect(ctx, x, y, size, size, radius);
    ctx.fill();
    ctx.restore();

    // 裁剪框边框
    ctx.save();
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
    ctx.strokeStyle = '#00E5FF';
    this._roundRect(ctx, x, y, size, size, radius);
    ctx.stroke();
    ctx.restore();

    // 网格线（九宫格）
    ctx.save();
    ctx.setLineDash([Math.round(6 * dpr), Math.round(6 * dpr)]);
    ctx.beginPath();
    ctx.moveTo(x + size / 3, y); ctx.lineTo(x + size / 3, y + size);
    ctx.moveTo(x + size * 2 / 3, y); ctx.lineTo(x + size * 2 / 3, y + size);
    ctx.moveTo(x, y + size / 3); ctx.lineTo(x + size, y + size / 3);
    ctx.moveTo(x, y + size * 2 / 3); ctx.lineTo(x + size, y + size * 2 / 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
    ctx.restore();

    // 角点（handle）
    ctx.save();
    const r = this.handleRadius;
    const handles = [
      { x: x, y: y },                   // TL
      { x: x + size, y: y },            // TR
      { x: x + size, y: y + size },     // BR
      { x: x, y: y + size }             // BL
    ];
    for (let i = 0; i < handles.length; i++) {
      ctx.beginPath();
      ctx.arc(handles[i].x, handles[i].y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#00E5FF';
      ctx.fill();
      // 内环
      ctx.beginPath();
      ctx.arc(handles[i].x, handles[i].y, Math.max(1, Math.round(4 * dpr)), 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    ctx.restore();
  },

  /**************************
   * 缩放/拖拽 约束：保证裁剪框被图片覆盖（不露底）
   **************************/
  _constrain() {
    const { imgW, imgH, scale } = this.state;
    if (!imgW || !imgH) return;
    const imgPW = imgW * scale;
    const imgPH = imgH * scale;
    const { x, y, size } = this.crop;

    // 图片的左上 corner tx,ty。要求：图片覆盖裁剪框区域
    const minTx = x + size - imgPW; // 图片右边至少到达裁剪框右边
    const minTy = y + size - imgPH;
    const maxTx = x; // 图片左边至多对齐裁剪框左边
    const maxTy = y;

    // 如果图片比裁剪框还小 (理论上 autoFit 已覆盖)，仍然做保护
    if (imgPW < size) {
      // 尽量把图片放在裁剪框中心
      const cx = x + size / 2;
      this.state.tx = cx - imgPW / 2;
    } else {
      this.state.tx = this._clamp(this.state.tx, minTx, maxTx);
    }

    if (imgPH < size) {
      const cy = y + size / 2;
      this.state.ty = cy - imgPH / 2;
    } else {
      this.state.ty = this._clamp(this.state.ty, minTy, maxTy);
    }
  },

  /**************************
   * 裁剪框调整算法（保证正方形）
   * corner: 0=TL,1=TR,2=BR,3=BL
   **************************/
  _resizeCrop(corner, x, y) {
    const start = this.interaction.startCrop || { ...this.crop };
    const x1 = start.x;
    const y1 = start.y;
    const x2 = start.x + start.size;
    const y2 = start.y + start.size;

    // 对应的对角点（不动的点）
    let oppX, oppY;
    if (corner === 0) { oppX = x2; oppY = y2; }
    else if (corner === 1) { oppX = x1; oppY = y2; }
    else if (corner === 2) { oppX = x1; oppY = y1; }
    else { oppX = x2; oppY = y1; }

    // 计算 candidate size：以对角点到当前触点的最大轴向距离为正方形边长
    let candidate = Math.max(Math.abs(x - oppX), Math.abs(y - oppY));
    candidate = Math.max(candidate, this.minCropSize);

    // 限制不超出画布（以对角点作为参考）
    if (corner === 0) {
      candidate = Math.min(candidate, oppX, oppY);
    } else if (corner === 1) {
      // oppX = x1 (left), oppY = y2 (bottom)
      candidate = Math.min(candidate, this.viewW - oppX, oppY);
    } else if (corner === 2) {
      // oppX = x1 (left), oppY = y1 (top)
      candidate = Math.min(candidate, this.viewW - oppX, this.viewH - oppY);
    } else if (corner === 3) {
      // oppX = x2 (right), oppY = y1 (top)
      candidate = Math.min(candidate, oppX, this.viewH - oppY);
    }

    const newSize = Math.max(this.minCropSize, Math.floor(candidate));

    // 根据 corner 计算新的 top-left (nx, ny)
    let nx = start.x;
    let ny = start.y;
    if (corner === 0) {
      nx = oppX - newSize;
      ny = oppY - newSize;
    } else if (corner === 1) {
      nx = oppX;
      ny = oppY - newSize;
    } else if (corner === 2) {
      nx = oppX;
      ny = oppY;
    } else {
      nx = oppX - newSize;
      ny = oppY;
    }

    // 最终 clamp，保证在画布内部
    nx = this._clamp(nx, 0, this.viewW - newSize);
    ny = this._clamp(ny, 0, this.viewH - newSize);

    this.crop.x = Math.round(nx);
    this.crop.y = Math.round(ny);
    this.crop.size = Math.round(newSize);
  },

  /**************************
   * 导出裁剪区域：优先使用 node.toTempFilePath，若不存在则调用 wx.canvasToTempFilePath 回退
   **************************/
  exportCrop() {
    if (!this.state.img) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    const { x, y, size } = this.crop;
    const dest = 1024; // 导出目标分辨率（边长）

    this.canvasToTempFilePathSafe({
      x, y, width: size, height: size,
      destWidth: dest, destHeight: dest,
      success: (res) => {
        this.setData({ outputPath: res.tempFilePath });
        wx.showToast({ title: '已导出', icon: 'success' });
      },
      fail: (err) => {
        console.error('导出失败', err);
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    });
  },

  canvasToTempFilePathSafe(opts) {
    // 优先使用 Canvas Node 的 toTempFilePath（新版 API）
    if (this.canvas && typeof this.canvas.toTempFilePath === 'function') {
      try {
        // 该方法接收回调对象
        this.canvas.toTempFilePath({
          x: opts.x,
          y: opts.y,
          width: opts.width,
          height: opts.height,
          destWidth: opts.destWidth,
          destHeight: opts.destHeight,
          fileType: 'png',
          quality: 1,
          success: opts.success,
          fail: opts.fail
        });
        return;
      } catch (e) {
        console.warn('canvas.toTempFilePath 调用异常，回退到 wx.canvasToTempFilePath', e);
      }
    }

    // 回退：使用旧的 wx.canvasToTempFilePath（需要 canvasId / component）
    wx.canvasToTempFilePath({
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      destWidth: opts.destWidth,
      destHeight: opts.destHeight,
      fileType: 'png',
      quality: 1,
      canvasId: 'editor'
    }, this).then
      ? // 某些基础库返回 Promise
      wx.canvasToTempFilePath({
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height,
        destWidth: opts.destWidth,
        destHeight: opts.destHeight,
        fileType: 'png',
        quality: 1,
        canvasId: 'editor',
        success: opts.success,
        fail: opts.fail
      })
      : null;

    // 兼容回调写法（保证在没有 Promise 的基础库下也可以）
    wx.canvasToTempFilePath({
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      destWidth: opts.destWidth,
      destHeight: opts.destHeight,
      fileType: 'png',
      quality: 1,
      canvasId: 'editor',
      success: opts.success,
      fail: opts.fail
    });
  },

  /**************************
   * 工具函数
   **************************/
  _distance(p1, p2) { const dx = p1.x - p2.x; const dy = p1.y - p2.y; return Math.sqrt(dx*dx + dy*dy); },
  _clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },

  _roundRect(ctx, x, y, w, h, r) {
    const min = Math.min(w, h);
    if (r > min / 2) r = min / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  _hitHandle(x, y) {
    const r = this.handleRadius || Math.round(12 * dpr);
    const cx = this.crop.x;
    const cy = this.crop.y;
    const s = this.crop.size;
    const handles = [
      { x: cx, y: cy },               // TL
      { x: cx + s, y: cy },           // TR
      { x: cx + s, y: cy + s },       // BR
      { x: cx, y: cy + s }            // BL
    ];
    for (let i = 0; i < handles.length; i++) {
      const dx = x - handles[i].x;
      const dy = y - handles[i].y;
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  },

  _pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.size && y >= rect.y && y <= rect.y + rect.size;
  }
});