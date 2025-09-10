// image-behavior.js
// 微信小程序 Behavior：处理图片加载、移动、缩放、旋转
module.exports = Behavior({
  // 内部数据
  data: {
    ctx2d: null,           // Canvas 2D 上下文
    canvasNode: null,      // Canvas 节点
    imageInfo: null,       // 图片信息
    imageObj: null,        // Image 对象
    imageX: 0,             // 图片中心点 X 坐标（逻辑像素）
    imageY: 0,             // 图片中心点 Y 坐标（逻辑像素）
    imageScale: 1,         // 图片缩放比例
    imageRotation: 0,      // 图片旋转角度（度）
    touchStartData: null,  // 触摸开始时的坐标数组
    lastTouchData: null,   // 上一次触摸坐标数组
    isDraggingImage: false,// 是否正在拖动图片
    isScaling: false,      // 是否正在缩放图片
    isMoving: false,       // 防止绘制重入
    rotatedSizeCache: null,// 缓存旋转后边界计算结果
    consts: {              // 常量定义
      MAX_SCALE: 5,        // 最大缩放比例
      MIN_SCALE_FACTOR: 0.5, // 最小缩放因子
      TOUCH_THRESHOLD: 1,  // 触摸移动阈值（px）
      ROTATE_STEP: 90      // 旋转步进角度（度）
    }
  },

  methods: {
    /**
     * 绘制图片到 Canvas（以 imageX/Y 为中心点绘制）
     */
    _drawImage() {
      const { ctx2d, imageObj, imageX, imageY, imageScale, imageRotation, canvasWidth, canvasHeight } = this.data;
      if (!ctx2d) return;

      // 绘制画布边框
      ctx2d.strokeStyle = '#cccccc';
      ctx2d.setLineDash([5, 3]);
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(0, 0, canvasWidth, canvasHeight);
      ctx2d.setLineDash([]);

      // 图片未加载时显示提示
      if (!imageObj) {
        ctx2d.fillStyle = '#f5f5f5';
        ctx2d.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx2d.fillStyle = '#999';
        ctx2d.font = '14px sans-serif';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('请选择图片', canvasWidth / 2, canvasHeight / 2);
        return;
      }

      ctx2d.save();
      ctx2d.translate(imageX, imageY);
      ctx2d.rotate((imageRotation * Math.PI) / 180);

      const drawWidth = imageObj.width * imageScale;
      const drawHeight = imageObj.height * imageScale;

      ctx2d.drawImage(
        imageObj,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
      ctx2d.restore();
    },

    /**
     * 选择图片（从相册或相机）
     */
    _chooseImage() {
      const { canvasNode } = this.data;
      if (!canvasNode) {
        wx.showToast({ title: '画布未就绪', icon: 'none' });
        return;
      }

      wx.chooseImage({
        count: 1,
        sourceType: ['album', 'camera'],
        success: (res) => {
          const imagePath = res.tempFilePaths[0];
          wx.getImageInfo({
            src: imagePath,
            success: (imageInfo) => {
              const imageObj = canvasNode.createImage();
              // 加载超时处理
              const loadTimeout = setTimeout(() => {
                console.error('[图片行为] 图片加载超时');
                wx.showToast({ title: '图片加载超时', icon: 'none' });
              }, 5000);

              imageObj.onload = () => {
                clearTimeout(loadTimeout);
                this.setData({
                  imageInfo,
                  imageObj,
                  imageRotation: 0
                }, () => {
                  this.data.rotatedSizeCache = null; // 失效边界缓存
                  this._centerImage();
                  this._initCropBox(); // 初始化剪裁框
                  this.throttledDraw && this.throttledDraw();
                });
              };
              imageObj.onerror = (err) => {
                clearTimeout(loadTimeout);
                console.error('[图片行为] 图片加载失败:', err);
                wx.showToast({ title: '图片加载失败', icon: 'none' });
              };
              imageObj.src = imagePath;
            },
            fail: (err) => {
              console.error('[图片行为] 获取图片信息失败:', err);
              wx.showToast({ title: '获取图片信息失败', icon: 'none' });
            }
          });
        },
        fail: (err) => {
          console.error('[图片行为] 选择图片失败:', err);
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      });
    },

    /**
     * 将图片居中显示在画布内
     */
    _centerImage() {
      const { imageObj, canvasWidth, canvasHeight, imagePadding } = this.data;
      if (!imageObj || !canvasWidth || !canvasHeight) return;

      const padding = imagePadding;
      const availableWidth = canvasWidth - padding;
      const availableHeight = canvasHeight - padding;

      const scaleX = availableWidth / imageObj.width;
      const scaleY = availableHeight / imageObj.height;
      const scale = Math.min(scaleX, scaleY, 1);

      const imageX = canvasWidth / 2;
      const imageY = canvasHeight / 2;

      this.setData({
        imageX: imageX,
        imageY: imageY,
        imageScale: scale
      });
      this.data.rotatedSizeCache = null; // 失效边界缓存
    },

    /**
     * 将触摸坐标转换为逻辑坐标
     * @param {Object} touch 触摸对象
     * @returns {Object} {x, y} 逻辑坐标
     */
    _getLogicalTouch(touch) {
      return {
        x: touch.x,
        y: touch.y
      };
    },

    /**
     * 图片触摸开始
     * @param {Object} e 触摸事件对象
     */
    _onImageTouchStart(e) {
      const { touches } = e;
      if (!touches || touches.length === 0) return;

      const logicalTouches = touches.map(touch => this._getLogicalTouch(touch));

      // 直接修改临时状态，避免 setData 异步延迟
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
      const { lastTouchData, imageX, imageY, imageScale, isDraggingImage, isScaling } = this.data;
      
      if (!touches || !lastTouchData || !this.data.imageObj) return;

      const currentLogicalTouches = touches.map(touch => this._getLogicalTouch(touch));

      if (isDraggingImage && touches.length === 1) {
        const dx = currentLogicalTouches[0].x - lastTouchData[0].x;
        const dy = currentLogicalTouches[0].y - lastTouchData[0].y;
        
        // 防抖动：忽略小移动
        if (Math.abs(dx) < this.data.consts.TOUCH_THRESHOLD && Math.abs(dy) < this.data.consts.TOUCH_THRESHOLD) return;
        
        this.data.imageX = imageX + dx;
        this.data.imageY = imageY + dy;
        this.data.lastTouchData = currentLogicalTouches;

        // 边界检查
        this._clampImagePosition();

        // 立即绘制
        if (!this.data.isMoving) {
          this.data.isMoving = true;
          wx.nextTick(() => {
            this._drawCanvas();
            this.data.isMoving = false;
          });
        }
      } else if (isScaling && touches.length === 2) {
        const getDistance = (points) => {
          const dx = points[1].x - points[0].x;
          const dy = points[1].y - points[0].y;
          return Math.sqrt(dx * dx + dy * dy);
        };

        const currentDistance = getDistance(currentLogicalTouches);
        const lastDistance = getDistance(lastTouchData);
        
        if (lastDistance > 0) {
          const scaleRatio = currentDistance / lastDistance;
          let newScale = imageScale * scaleRatio;
          const minScale = Math.min(this.data.canvasWidth / this.data.imageObj.width, this.data.canvasHeight / this.data.imageObj.height) * this.data.consts.MIN_SCALE_FACTOR;
          newScale = Math.max(minScale, Math.min(newScale, this.data.consts.MAX_SCALE));

          this.data.imageScale = newScale;
          this.data.lastTouchData = currentLogicalTouches;
          this.data.rotatedSizeCache = null; // 失效缓存

          if (!this.data.isMoving) {
            this.data.isMoving = true;
            wx.nextTick(() => {
              this._drawCanvas();
              this.data.isMoving = false;
            });
          }
        }
      }
    },

    /**
     * 边界检查，限制图片位置（支持旋转）
     */
    _clampImagePosition() {
      const { imageObj, imageScale, imageRotation, canvasWidth, canvasHeight, boundaryPadding } = this.data;
      if (!imageObj) return;

      // 缓存旋转计算结果
      const cacheKey = `${imageRotation}-${imageScale}-${imageObj.width}-${imageObj.height}`;
      if (this.data.rotatedSizeCache && this.data.rotatedSizeCache.key === cacheKey) {
        const { halfWidth, halfHeight } = this.data.rotatedSizeCache;
        this.data.imageX = Math.max(halfWidth, Math.min(this.data.imageX, canvasWidth - halfWidth));
        this.data.imageY = Math.max(halfHeight, Math.min(this.data.imageY, canvasHeight - halfHeight));
        return;
      }

      const rad = (imageRotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const halfWidth = (imageObj.width * imageScale / 2 * cos) + (imageObj.height * imageScale / 2 * sin) + boundaryPadding;
      const halfHeight = (imageObj.width * imageScale / 2 * sin) + (imageObj.height * imageScale / 2 * cos) + boundaryPadding;

      this.data.imageX = Math.max(halfWidth, Math.min(this.data.imageX, canvasWidth - halfWidth));
      this.data.imageY = Math.max(halfHeight, Math.min(this.data.imageY, canvasHeight - halfHeight));

      this.data.rotatedSizeCache = {
        key: cacheKey,
        halfWidth,
        halfHeight
      };
    },

    /**
     * 图片触摸结束（同步最终状态）
     */
    _onImageTouchEnd() {
      // 直接清零临时状态
      this.data.isDraggingImage = false;
      this.data.isScaling = false;
      this.data.touchStartData = null;
      this.data.lastTouchData = null;

      this.setData({
        isDraggingImage: false,
        isScaling: false,
        touchStartData: null,
        lastTouchData: null
      });
    },

    /**
     * 旋转图片 90 度
     */
    _rotateImage() {
      if (!this.data.imageObj) {
        wx.showToast({ title: '请先选择图片', icon: 'none' });
        return;
      }
      this.setData({
        imageRotation: (this.data.imageRotation + this.data.consts.ROTATE_STEP) % 360
      }, () => {
        this.data.rotatedSizeCache = null; // 失效缓存
        this._clampImagePosition(); // 旋转后检查边界
        this.throttledDraw && this.throttledDraw();
      });
    },

    /**
     * 重置图片位置、缩放、旋转
     */
    _resetImage() {
      if (!this.data.imageObj) {
        wx.showToast({ title: '请先选择图片', icon: 'none' });
        return;
      }
      this._centerImage();
      this._initCropBox(); // 初始化剪裁框
      this.setData({ imageRotation: 0 }, () => {
        this.data.rotatedSizeCache = null; // 失效缓存
        this.throttledDraw && this.throttledDraw();
      });
    }
  }
});