// image-behavior.js 代码
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

    // 触摸状态
    touchStartData: null,  // 触摸开始时的坐标数组
    lastTouchData: null,   // 上一次触摸坐标数组
    isDraggingImage: false,// 是否正在拖动图片
    isScaling: false,      // 是否正在缩放图片
    isMoving: false        // 防止绘制重入
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
              imageObj.onload = () => {
                this.setData({
                  imageInfo,
                  imageObj,
                  imageRotation: 0
                }, () => {
                  this._centerImage();
                  this.throttledDraw && this.throttledDraw();
                });
              };
              imageObj.onerror = (err) => {
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
          wx.showToast({ title: '选择图片失败', icon: 'none' }); // ✅ 统一错误处理
        }
      });
    },

    /**
     * 将图片居中显示在画布内
     */
    _centerImage() {
      const { imageObj, canvasWidth, canvasHeight } = this.data;
      if (!imageObj || !canvasWidth || !canvasHeight) return;

      const padding = 40; // ✅ 可优化：作为属性配置
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
    },

    /**
     * 获取触摸逻辑坐标（CanvasTouch 专用）
     * @param {Object} touch CanvasTouch 对象
     * @returns {Object} {x, y} 逻辑坐标
     */
    _getLogicalTouch(touch) {
      // ✅ 关键修复：使用 touch.x/y，直接是相对于 Canvas 的逻辑坐标，无需 dpr 或位置减法
      // 官方：CanvasTouch.x/y 已匹配 ctx.scale(dpr, dpr) 的逻辑系
      return {
        x: touch.x,
        y: touch.y
      };
    },

    /**
     * 图片触摸开始
     */
    _onImageTouchStart(e) {
      const { touches } = e;
      if (!touches || touches.length === 0) return;

      const logicalTouches = touches.map(touch => this._getLogicalTouch(touch));

      // 保存触摸状态
      this.setData({
        touchStartData: logicalTouches,
        lastTouchData: logicalTouches
      });

      if (touches.length === 1) {
        this.setData({
          isDraggingImage: true,
          isScaling: false
        });
      } else if (touches.length === 2) {
        this.setData({
          isScaling: true,
          isDraggingImage: false
        });
      }
    },

    /**
     * 图片触摸移动
     */
    _onImageTouchMove(e) {
      const { touches } = e;
      const { lastTouchData, imageX, imageY, imageScale, isDraggingImage, isScaling } = this.data;
      
      if (!touches || !lastTouchData || !this.data.imageObj) return;

      const currentLogicalTouches = touches.map(touch => this._getLogicalTouch(touch));

      if (isDraggingImage && touches.length === 1) {
        const dx = currentLogicalTouches[0].x - lastTouchData[0].x;
        const dy = currentLogicalTouches[0].y - lastTouchData[0].y;
        
        // ✅ 防抖动：忽略小移动（阈值 1px）
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        
        this.data.imageX = imageX + dx;
        this.data.imageY = imageY + dy;
        this.data.lastTouchData = currentLogicalTouches;

        // ✅ 边界检查
        this._clampImagePosition();

        // ✅ 立即绘制
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
          // ✅ 动态 minScale，避免过小
          const minScale = Math.min(this.data.canvasWidth / this.data.imageObj.width, this.data.canvasHeight / this.data.imageObj.height) * 0.5;
          newScale = Math.max(minScale, Math.min(newScale, 5));

          this.data.imageScale = newScale;
          this.data.lastTouchData = currentLogicalTouches;

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

      // ✅ 优化：计算旋转后 bounding box half size
      const rad = (imageRotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const halfWidth = (imageObj.width * imageScale / 2 * cos) + (imageObj.height * imageScale / 2 * sin) + boundaryPadding;
      const halfHeight = (imageObj.width * imageScale / 2 * sin) + (imageObj.height * imageScale / 2 * cos) + boundaryPadding;

      // 确保图片边缘不超过画布（可配置 padding）
      this.data.imageX = Math.max(halfWidth, Math.min(this.data.imageX, canvasWidth - halfWidth));
      this.data.imageY = Math.max(halfHeight, Math.min(this.data.imageY, canvasHeight - halfHeight));
    },

    /**
     * 图片触摸结束（同步最终状态）
     */
    _onImageTouchEnd() {
      // ✅ 优化：仅 setData 必要字段，减少开销
      this.setData({
        isDraggingImage: false,
        isScaling: false,
        touchStartData: null,
        lastTouchData: null
      });
      // imageX/Y/Scale 已直接修改，无需重复 set
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
        imageRotation: (this.data.imageRotation + 90) % 360
      }, () => {
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
      this.setData({ imageRotation: 0 }, () => {
        this.throttledDraw && this.throttledDraw();
      });
    }
  }
});