Page({
  data: {
    canvasWidth: 300,
    canvasHeight: 400,
    imageInfo: null,
    imageLoaded: false,
    imageScale: 1,
    imageX: 0,
    imageY: 0,
    imageRotation: 0,
    cropBox: { x: 50, y: 50, width: 200, height: 200 },
    isMovingImage: false,
    isMovingCropBox: false,
    isResizingCropBox: false,
    activeCorner: null,
    lastTouchDistance: 0,
    lastTouchCenter: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
    startImagePos: { x: 0, y: 0 },
    startCropBox: null,
    ctx: null,
    dpr: 1
  },

  onLoad() {
    this.initCanvas();
  },

  initCanvas() {
    const systemInfo = wx.getSystemInfoSync();
    const dpr = systemInfo.pixelRatio || 1;
    const canvasWidth = 300;
    const canvasHeight = 400;
    this.setData({ canvasWidth, canvasHeight, dpr });
    this.data.ctx = wx.createCanvasContext('imageCanvas', this);
    this.drawCanvas();
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.loadImage(res.tempFilePaths[0]);
      }
    });
  },

  loadImage(imagePath) {
    wx.getImageInfo({
      src: imagePath,
      success: (res) => {
        const { canvasWidth, canvasHeight } = this.data;
        const padding = 20;
        const scaleX = (canvasWidth - padding * 2) / res.width;
        const scaleY = (canvasHeight - padding * 2) / res.height;
        const initialScale = Math.min(scaleX, scaleY, 1);
        const imageWidth = res.width * initialScale;
        const imageHeight = res.height * initialScale;
        const imageX = (canvasWidth - imageWidth) / 2;
        const imageY = (canvasHeight - imageHeight) / 2;

        const cropBox = {
          x: imageX + 10,
          y: imageY + 10,
          width: imageWidth - 20,
          height: imageHeight - 20
        };

        this.setData({
          imageInfo: { path: imagePath, width: res.width, height: res.height },
          imageLoaded: true,
          imageScale: initialScale,
          imageX,
          imageY,
          imageRotation: 0,
          cropBox
        });

        this.drawCanvas();
      }
    });
  },

  rotateImage() {
    if (!this.data.imageLoaded) return;
    const newRotation = (this.data.imageRotation - 90) % 360;
    this.setData({ imageRotation: newRotation });
    const constrainedPos = this.constrainImagePosition(this.data.imageX, this.data.imageY);
    this.setData({ imageX: constrainedPos.x, imageY: constrainedPos.y });
    this.drawCanvas();
  },

  drawCanvas() {
    const ctx = this.data.ctx;
    if (!ctx) return;
    const { canvasWidth, canvasHeight } = this.data;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (this.data.imageLoaded && this.data.imageInfo) {
      this.drawImage(ctx);
    }
    this.drawCropBox(ctx);
    ctx.draw();
  },

  drawImage(ctx) {
    const { imageInfo, imageScale, imageX, imageY, imageRotation } = this.data;
    ctx.save();
    const imageWidth = imageInfo.width * imageScale;
    const imageHeight = imageInfo.height * imageScale;
    const centerX = imageX + imageWidth / 2;
    const centerY = imageY + imageHeight / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(imageRotation * Math.PI / 180);
    ctx.drawImage(imageInfo.path, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    ctx.restore();
  },

  drawCropBox(ctx) {
    const { canvasWidth, canvasHeight, cropBox } = this.data;

    // 半透明遮罩
    ctx.setFillStyle('rgba(0,0,0,0.3)');
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 裁剪框边框
    ctx.setStrokeStyle('#ffffff');
    ctx.setLineWidth(2);
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);

    // 四角控制点
    const cornerSize = 8;
    const corners = [
      { x: cropBox.x, y: cropBox.y },
      { x: cropBox.x + cropBox.width, y: cropBox.y },
      { x: cropBox.x + cropBox.width, y: cropBox.y + cropBox.height },
      { x: cropBox.x, y: cropBox.y + cropBox.height }
    ];
    ctx.setFillStyle('#4CAF50');
    corners.forEach(corner => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, cornerSize, 0, 2 * Math.PI);
      ctx.fill();
    });
  },

  onTouchStart(e) {
    if (!this.data.imageLoaded) return;
    const touch = e.touches[0];
    const { x, y } = touch;

    this.setData({
      startTouch: { x, y },
      startImagePos: { x: this.data.imageX, y: this.data.imageY },
      startCropBox: { ...this.data.cropBox }
    });

    const corner = this.getCornerAtPoint(x, y);
    if (corner !== null) {
      this.setData({ isResizingCropBox: true, activeCorner: corner });
      return;
    }
    if (this.isPointInCropBox(x, y)) {
      this.setData({ isMovingCropBox: true });
      return;
    }
    if (e.touches.length === 2) {
      const distance = this.getTouchDistance(e.touches);
      const center = this.getTouchCenter(e.touches);
      this.setData({ lastTouchDistance: distance, lastTouchCenter: center });
    } else {
      this.setData({ isMovingImage: true });
    }
  },

  onTouchMove(e) {
    if (!this.data.imageLoaded) return;
    const touch = e.touches[0];
    const deltaX = touch.x - this.data.startTouch.x;
    const deltaY = touch.y - this.data.startTouch.y;

    if (this.data.isResizingCropBox) {
      this.resizeCropBox(deltaX, deltaY);
    } else if (this.data.isMovingCropBox) {
      this.moveCropBox(deltaX, deltaY);
    } else if (e.touches.length === 2) {
      const distance = this.getTouchDistance(e.touches);
      const center = this.getTouchCenter(e.touches);
      if (this.data.lastTouchDistance > 0) {
        const scale = distance / this.data.lastTouchDistance;
        this.scaleImage(scale, center);
      }
      this.setData({ lastTouchDistance: distance, lastTouchCenter: center });
    } else if (this.data.isMovingImage) {
      this.moveImage(deltaX, deltaY);
    }

    this.drawCanvas();
  },

  onTouchEnd() {
    this.setData({
      isMovingImage: false,
      isMovingCropBox: false,
      isResizingCropBox: false,
      activeCorner: null,
      lastTouchDistance: 0
    });
  },

  moveImage(deltaX, deltaY) {
    const newX = this.data.startImagePos.x + deltaX;
    const newY = this.data.startImagePos.y + deltaY;
    const constrainedPos = this.constrainImagePosition(newX, newY);
    this.setData({ imageX: constrainedPos.x, imageY: constrainedPos.y });
  },

  scaleImage(scaleFactor, center) {
    const newScale = Math.max(0.1, Math.min(5, this.data.imageScale * scaleFactor));
    const deltaScale = newScale / this.data.imageScale;
    const newX = center.x - (center.x - this.data.imageX) * deltaScale;
    const newY = center.y - (center.y - this.data.imageY) * deltaScale;
    const constrainedPos = this.constrainImagePosition(newX, newY, newScale);
    this.setData({ imageScale: newScale, imageX: constrainedPos.x, imageY: constrainedPos.y });
  },

  moveCropBox(deltaX, deltaY) {
    const { startCropBox, canvasWidth, canvasHeight, cropBox } = this.data;
    let newX = startCropBox.x + deltaX;
    let newY = startCropBox.y + deltaY;
    newX = Math.max(0, Math.min(canvasWidth - cropBox.width, newX));
    newY = Math.max(0, Math.min(canvasHeight - cropBox.height, newY));
    
    this.setData({ 'cropBox.x': newX, 'cropBox.y': newY });

    const constrainedPos = this.constrainImagePosition(this.data.imageX, this.data.imageY);
    this.setData({ imageX: constrainedPos.x, imageY: constrainedPos.y });
  },

  resizeCropBox(deltaX, deltaY) {
    const { startCropBox, activeCorner, canvasWidth, canvasHeight } = this.data;
    let newCropBox = { ...startCropBox };
    const minSize = 50;

    switch (activeCorner) {
      case 0: // 左上
        newCropBox.width = Math.max(minSize, startCropBox.width - deltaX);
        newCropBox.height = Math.max(minSize, startCropBox.height - deltaY);
        newCropBox.x = startCropBox.x + startCropBox.width - newCropBox.width;
        newCropBox.y = startCropBox.y + startCropBox.height - newCropBox.height;
        break;
      case 1: // 右上
        newCropBox.width = Math.max(minSize, startCropBox.width + deltaX);
        newCropBox.height = Math.max(minSize, startCropBox.height - deltaY);
        newCropBox.y = startCropBox.y + startCropBox.height - newCropBox.height;
        break;
      case 2: // 右下
        newCropBox.width = Math.max(minSize, startCropBox.width + deltaX);
        newCropBox.height = Math.max(minSize, startCropBox.height + deltaY);
        break;
      case 3: // 左下
        newCropBox.width = Math.max(minSize, startCropBox.width - deltaX);
        newCropBox.height = Math.max(minSize, startCropBox.height + deltaY);
        newCropBox.x = startCropBox.x + startCropBox.width - newCropBox.width;
        break;
    }

    // 限制裁剪框不超出画布
    newCropBox.x = Math.max(0, newCropBox.x);
    newCropBox.y = Math.max(0, newCropBox.y);
    newCropBox.width = Math.min(canvasWidth - newCropBox.x, newCropBox.width);
    newCropBox.height = Math.min(canvasHeight - newCropBox.y, newCropBox.height);

    this.setData({ cropBox: newCropBox });

    const constrainedPos = this.constrainImagePosition(this.data.imageX, this.data.imageY);
    this.setData({ imageX: constrainedPos.x, imageY: constrainedPos.y });
  },

  constrainImagePosition(x, y, scale = null) {
    const currentScale = scale || this.data.imageScale;
    const { imageInfo, cropBox, imageRotation } = this.data;
    if (!imageInfo) return { x, y };

    const imageWidth = imageInfo.width * currentScale;
    const imageHeight = imageInfo.height * currentScale;
    const effectiveWidth = (imageRotation % 180 === 0) ? imageWidth : imageHeight;
    const effectiveHeight = (imageRotation % 180 === 0) ? imageHeight : imageWidth;

    const maxX = cropBox.x;
    const maxY = cropBox.y;
    const minX = cropBox.x + cropBox.width - effectiveWidth;
    const minY = cropBox.y + cropBox.height - effectiveHeight;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  },

  getCornerAtPoint(x, y) {
    const { cropBox } = this.data;
    const cornerSize = 15;
    const corners = [
      { x: cropBox.x, y: cropBox.y },
      { x: cropBox.x + cropBox.width, y: cropBox.y },
      { x: cropBox.x + cropBox.width, y: cropBox.y + cropBox.height },
      { x: cropBox.x, y: cropBox.y + cropBox.height }
    ];
    for (let i = 0; i < corners.length; i++) {
      const dist = Math.sqrt(Math.pow(x - corners[i].x, 2) + Math.pow(y - corners[i].y, 2));
      if (dist <= cornerSize) return i;
    }
    return null;
  },

  isPointInCropBox(x, y) {
    const { cropBox } = this.data;
    return x >= cropBox.x && x <= cropBox.x + cropBox.width &&
           y >= cropBox.y && y <= cropBox.y + cropBox.height;
  },

  getTouchDistance(touches) {
    const dx = touches[0].x - touches[1].x;
    const dy = touches[0].y - touches[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  getTouchCenter(touches) {
    return {
      x: (touches[0].x + touches[1].x) / 2,
      y: (touches[0].y + touches[1].y) / 2
    };
  },

  exportCroppedImage() {
    if (!this.data.imageLoaded) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    const tempCtx = wx.createCanvasContext('tempCanvas', this);
    const { cropBox, imageInfo, imageScale, imageX, imageY, imageRotation, dpr } = this.data;
    const exportWidth = cropBox.width;
    const exportHeight = cropBox.height;

    tempCtx.clearRect(0, 0, exportWidth, exportHeight);
    tempCtx.save();

    const relativeX = imageX - cropBox.x;
    const relativeY = imageY - cropBox.y;
    const imageWidth = imageInfo.width * imageScale;
    const imageHeight = imageInfo.height * imageScale;
    const centerX = relativeX + imageWidth / 2;
    const centerY = relativeY + imageHeight / 2;

    tempCtx.translate(centerX, centerY);
    tempCtx.rotate(imageRotation * Math.PI / 180);
    tempCtx.drawImage(imageInfo.path, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    tempCtx.restore();

    tempCtx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'tempCanvas',
        width: exportWidth,
        height: exportHeight,
        destWidth: exportWidth * dpr,
        destHeight: exportHeight * dpr,
        success: (res) => {
          wx.previewImage({ urls: [res.tempFilePath] });
        },
        fail: (err) => {
          console.error('导出失败:', err);
          wx.showToast({ title: '导出失败', icon: 'none' });
        }
      }, this);
    });
  }
});