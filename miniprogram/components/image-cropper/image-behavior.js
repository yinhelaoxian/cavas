// image-behavior.js
// 微信小程序 Behavior：处理图片加载、移动、缩放、旋转
module.exports = Behavior({
  data: {
    ctx2d: null,           // Canvas 2D 上下文
    canvasNode: null,      // Canvas 节点
    imageInfo: null,       // 图片信息
    imageObj: null,        // Image 对象
    imageX: 0,             // 图片中心点 X 坐标（逻辑像素）
    imageY: 0,             // 图片中心点 Y 坐标（逻辑像素）
    imageScale: 1,         // 图片缩放比例
    imageRotation: 0,      // 图片旋转角度（度）
    userImageX: 0,         // 用户手动调整的 X 坐标
    userImageY: 0,         // 用户手动调整的 Y 坐标
    touchStartData: null,  // 触摸开始时的坐标数组
    lastTouchData: null,   // 上一次触摸坐标数组
    isDraggingImage: false,// 是否正在拖动图片
    isScaling: false,      // 是否正在缩放图片
    isMoving: false,       // 防止绘制重入
    rotatedSizeCache: null,// 缓存旋转后边界计算结果
    consts: {              // 常量定义
      MAX_SCALE: 5,        // 最大缩放比例
      MIN_SCALE_FACTOR: 0.5, // 最小缩放因子
      TOUCH_THRESHOLD: 3,  // 触摸移动阈值（像素）
      ROTATE_STEP: 90      // 旋转步进角度（度）
    },
    maxImageSize: 2000     // 最大图片尺寸（像素）
  },

  methods: {
    /**
     * 内部方法：处理图片选择结果
     * @param {string} imagePath 图片本地临时路径
     * @returns {Promise<void>} 加载结果
     */
    _handleImageSelected(imagePath) {
      const { canvasNode, canvasWidth, canvasHeight, maxImageSize } = this.data;
      if (!canvasNode || canvasWidth === 0 || canvasHeight === 0) {
        return Promise.reject(new Error('画布或尺寸未就绪'));
      }

      return new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: imagePath,
          success: (imageInfo) => {
            let compressWidth = imageInfo.width;
            let compressHeight = imageInfo.height;
            if (compressWidth > maxImageSize || compressHeight > maxImageSize) {
              const ratio = Math.min(maxImageSize / compressWidth, maxImageSize / compressHeight);
              compressWidth = Math.floor(compressWidth * ratio);
              compressHeight = Math.floor(compressHeight * ratio);
            }

            wx.compressImage({
              src: imagePath,
              width: compressWidth,
              height: compressHeight,
              quality: 80,
              success: (compressRes) => {
                const imageObj = canvasNode.createImage();
                imageObj.onload = () => {
                  this.setData({
                    imageInfo,
                    imageObj,
                    imageRotation: 0,
                    userImageX: canvasWidth / 2,
                    userImageY: canvasHeight / 2
                  }, () => {
                    this.data.rotatedSizeCache = null;
                    this._centerImage();
                    resolve();
                  });
                };
                imageObj.onerror = (err) => {
                  this._destroyImageObj();
                  reject(err);
                };
                imageObj.src = compressRes.tempFilePath;
              },
              fail: (err) => reject(err)
            });
          },
          fail: (err) => reject(err)
        });
      });
    },

    /**
     * 销毁图片对象
     * @description 清理图片资源，防止内存泄漏
     */
    _destroyImageObj() {
      const { imageObj } = this.data;
      if (imageObj) {
        imageObj.onload = null;
        imageObj.onerror = null;
        this.setData({ imageObj: null });
      }
    },

    /**
     * 绘制图片到 Canvas
     * @description 以 imageX/Y 为中心点绘制，考虑旋转和缩放
     */
    _drawImage() {
      const { ctx2d, imageObj, imageX, imageY, imageScale, imageRotation, canvasWidth, canvasHeight } = this.data;
      if (!ctx2d || !imageObj) return;

      ctx2d.save();
      ctx2d.translate(imageX, imageY);
      ctx2d.rotate((imageRotation * Math.PI) / 180);

      const drawWidth = imageObj.width * imageScale;
      const drawHeight = imageObj.height * imageScale;
      ctx2d.drawImage(imageObj, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx2d.restore();
    },

    /**
     * 将图片居中显示
     */
    _centerImage() {
      const { imageObj, canvasWidth, canvasHeight, imagePadding } = this.data;
      if (!imageObj) return;

      const padding = imagePadding;
      const availableWidth = canvasWidth - 2 * padding;
      const availableHeight = canvasHeight - 2 * padding;

      const scaleX = availableWidth / imageObj.width;
      const scaleY = availableHeight / imageObj.height;
      const scale = Math.min(scaleX, scaleY, 1);

      this.setData({
        imageX: canvasWidth / 2,
        imageY: canvasHeight / 2,
        imageScale: scale,
        userImageX: canvasWidth / 2,
        userImageY: canvasHeight / 2
      });
      this.data.rotatedSizeCache = null;
    },

    /**
     * 将触摸坐标转换为逻辑坐标
     * @param {Object} touch 触摸对象
     * @returns {Object} {x, y} 逻辑坐标
     */
    _getLogicalTouch(touch) {
      return { x: touch.x, y: touch.y };
    },

    /**
     * 图片触摸开始
     * @param {Object} e 触摸事件对象
     */
    _onImageTouchStart(e) {
      const { touches } = e;
      if (!Array.isArray(touches) || touches.length === 0) {
        console.warn('[触摸事件] 无效的 touches 参数');
        return;
      }

      const logicalTouches = touches.map(touch => this._getLogicalTouch(touch));
      this.data.touchStartData = logicalTouches;
      this.data.lastTouchData = logicalTouches;
      if (touches.length === 1) {
        this.data.isDraggingImage = true;
        this.data.isScaling = false;
      } else if (touches.length === 2) {
        this.data.isScaling = true;
        this.data.isDraggingImage = false;
      }
    },

    /**
     * 图片触摸移动
     * @param {Object} e 触摸事件对象
     */
    _onImageTouchMove(e) {
      const { touches } = e;
      if (!Array.isArray(touches) || !this.data.lastTouchData) return;

      const currentLogicalTouches = touches.map(touch => this._getLogicalTouch(touch));
      const { imageX, imageY, imageScale, isDraggingImage, isScaling, consts } = this.data;

      if (isDraggingImage && touches.length === 1) {
        const dx = currentLogicalTouches[0].x - this.data.lastTouchData[0].x;
        const dy = currentLogicalTouches[0].y - this.data.lastTouchData[0].y;
        const moveDistance = Math.sqrt(dx * dx + dy * dy);
        if (moveDistance < consts.TOUCH_THRESHOLD) return;

        this.data.imageX = imageX + dx;
        this.data.imageY = imageY + dy;
        this.data.userImageX = this.data.imageX;
        this.data.userImageY = this.data.imageY;
        this.data.lastTouchData = currentLogicalTouches;
        this._clampImagePosition();
      } else if (isScaling && touches.length === 2) {
        const getDistance = (points) => Math.sqrt((points[1].x - points[0].x) ** 2 + (points[1].y - points[0].y) ** 2);
        const getCenter = (points) => ({
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2
        });

        const currentDistance = getDistance(currentLogicalTouches);
        const lastDistance = getDistance(this.data.lastTouchData);
        const currentCenter = getCenter(currentLogicalTouches);
        const lastCenter = getCenter(this.data.lastTouchData);

        if (lastDistance > 0) {
          const scaleRatio = currentDistance / lastDistance;
          let newScale = imageScale * scaleRatio;
          const minScale = Math.min(this.data.canvasWidth / this.data.imageObj.width, this.data.canvasHeight / this.data.imageObj.height) * consts.MIN_SCALE_FACTOR;
          newScale = Math.max(minScale, Math.min(newScale, this.data.maxImageScale));

          if (newScale !== imageScale) {
            this.data.imageScale = newScale;
            this.data.imageX += (currentCenter.x - lastCenter.x) * (1 - scaleRatio);
            this.data.imageY += (currentCenter.y - lastCenter.y) * (1 - scaleRatio);
            this.data.lastTouchData = currentLogicalTouches;
            this.data.rotatedSizeCache = null;
          }
        }
      }
    },

    /**
     * 边界检查
     * @description 限制图片位置，支持旋转场景
     */
    _clampImagePosition() {
      const { imageObj, imageScale, imageRotation, canvasWidth, canvasHeight, boundaryPadding, userImageX, userImageY } = this.data;
      if (!imageObj) return;

      const cacheKey = `${imageRotation}-${imageScale}-${imageObj.width}-${imageObj.height}`;
      if (this.data.rotatedSizeCache && this.data.rotatedSizeCache.key === cacheKey) {
        const { halfWidth, halfHeight } = this.data.rotatedSizeCache;
        this.data.imageX = Math.max(halfWidth, Math.min(userImageX, canvasWidth - halfWidth));
        this.data.imageY = Math.max(halfHeight, Math.min(userImageY, canvasHeight - halfHeight));
        return;
      }

      const rad = (imageRotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const halfWidth = (imageObj.width * imageScale / 2 * cos) + (imageObj.height * imageScale / 2 * sin) + boundaryPadding;
      const halfHeight = (imageObj.width * imageScale / 2 * sin) + (imageObj.height * imageScale / 2 * cos) + boundaryPadding;

      this.data.imageX = Math.max(halfWidth, Math.min(userImageX, canvasWidth - halfWidth));
      this.data.imageY = Math.max(halfHeight, Math.min(userImageY, canvasHeight - halfHeight));

      this.data.rotatedSizeCache = { key: cacheKey, halfWidth, halfHeight };
    },

    /**
     * 图片触摸结束
     * @param {Object} e 触摸事件对象
     */
    _onImageTouchEnd() {
      this.data.isDraggingImage = false;
      this.data.isScaling = false;
      this.data.touchStartData = null;
      this.data.lastTouchData = null;
    },

    /**
     * 旋转图片
     */
    _rotateImage() {
      const userImageX = this.data.userImageX;
      const userImageY = this.data.userImageY;
      this.setData({
        imageRotation: (this.data.imageRotation + this.data.consts.ROTATE_STEP) % 360
      }, () => {
        this.data.rotatedSizeCache = null;
        this.data.userImageX = userImageX;
        this.data.userImageY = userImageY;
        this.data.imageX = userImageX;
        this.data.imageY = userImageY;
        this._clampImagePosition();
        this._drawCanvas();
      });
    },

    /**
     * 重置图片
     */
    _resetImage() {
      this._centerImage();
      this._initCropBox();
      this.setData({ imageRotation: 0 }, () => {
        this.data.rotatedSizeCache = null;
        this._drawCanvas();
      });
    }
  }
});