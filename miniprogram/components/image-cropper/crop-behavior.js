// crop-behavior.js
// 微信小程序 Behavior：处理剪裁框的显示、移动、调整大小和保存
module.exports = Behavior({
  // 内部数据
  data: {
    cropBox: { x: 0, y: 0, width: 0, height: 0 }, // 剪裁框位置和尺寸（逻辑像素）
    activeCorner: null,    // 当前激活的角点：'tl', 'tr', 'bl', 'br'
    isDraggingCrop: false, // 是否正在拖拽角点调整大小
    isDraggingBox: false,  // 是否正在拖拽整个剪裁框
    cropTouchStart: null,  // 触摸开始时的坐标
    consts: {              // 常量定义
      CORNER_SIZE: 12,     // 角点控制点半径（px）
      MIN_SIZE: 50,        // 剪裁框最小尺寸（px）
      TOUCH_THRESHOLD: 1,  // 触摸移动阈值（px）
      CORNER_TOLERANCE: 5  // 角点点击容错（px）
    }
  },

  methods: {
    /**
     * 初始化剪裁框位置（贴合图片四个角）
     */
    _initCropBox() {
      const { imageObj, imageX, imageY, imageScale, imageRotation, canvasWidth, canvasHeight } = this.data;
      if (!imageObj) {
        console.warn('[剪裁框] 未加载图片，跳过初始化');
        return;
      }

      // 计算图片在画布中的实际边界（考虑旋转和缩放）
      const rad = (imageRotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const imgWidth = imageObj.width * imageScale;
      const imgHeight = imageObj.height * imageScale;
      const halfWidth = (imgWidth / 2 * cos) + (imgHeight / 2 * sin);
      const halfHeight = (imgWidth / 2 * sin) + (imgHeight / 2 * cos);

      // 剪裁框贴合图片边界
      const cropBox = {
        x: imageX - halfWidth,
        y: imageY - halfHeight,
        width: imgWidth,
        height: imgHeight
      };

      // 限制剪裁框在画布内
      cropBox.x = Math.max(0, Math.min(cropBox.x, canvasWidth - cropBox.width));
      cropBox.y = Math.max(0, Math.min(cropBox.y, canvasHeight - cropBox.height));
      cropBox.width = Math.min(cropBox.width, canvasWidth);
      cropBox.height = Math.min(cropBox.height, canvasHeight);

      this.setData({ cropBox }, () => {
        this.throttledDraw && this.throttledDraw();
      });
    },

    /**
     * 绘制剪裁框（遮罩层 + 边框 + 九宫格 + 角点）
     */
    _drawCropBox() {
      const { ctx2d, cropBox, canvasWidth, canvasHeight } = this.data;
      const { CORNER_SIZE } = this.data.consts;
      if (!ctx2d || !this.data.imageObj) return;

      // 保存状态
      ctx2d.save();

      // 绘制半透明遮罩层（透明度 0.3，减少遮挡）
      ctx2d.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx2d.fillRect(0, 0, canvasWidth, canvasHeight);

      // “挖空”剪裁区域（内部完全透明）
      ctx2d.globalCompositeOperation = 'destination-out';
      ctx2d.fillRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
      ctx2d.globalCompositeOperation = 'source-over';

      // 绘制剪裁框边框
      ctx2d.strokeStyle = '#ffffff';
      ctx2d.lineWidth = 2;
      ctx2d.strokeRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);

      // 绘制九宫格辅助线
      ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx2d.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const x = cropBox.x + (cropBox.width / 3) * i;
        ctx2d.beginPath();
        ctx2d.moveTo(x, cropBox.y);
        ctx2d.lineTo(x, cropBox.y + cropBox.height);
        ctx2d.stroke();

        const y = cropBox.y + (cropBox.height / 3) * i;
        ctx2d.beginPath();
        ctx2d.moveTo(cropBox.x, y);
        ctx2d.lineTo(cropBox.x + cropBox.width, y);
        ctx2d.stroke();
      }

      // 绘制四个角的控制点（圆形）
      ctx2d.fillStyle = '#ffffff';
      ctx2d.strokeStyle = '#007aff';
      ctx2d.lineWidth = 2;
      const corners = [
        { x: cropBox.x, y: cropBox.y }, // 左上
        { x: cropBox.x + cropBox.width, y: cropBox.y }, // 右上
        { x: cropBox.x, y: cropBox.y + cropBox.height }, // 左下
        { x: cropBox.x + cropBox.width, y: cropBox.y + cropBox.height } // 右下
      ];
      corners.forEach(corner => {
        ctx2d.beginPath();
        ctx2d.arc(corner.x, corner.y, CORNER_SIZE, 0, 2 * Math.PI);
        ctx2d.fill();
        ctx2d.stroke();
      });

      ctx2d.restore();
    },

    /**
     * 将触摸坐标转换为逻辑坐标（使用 touch.x/y）
     * @param {Object} touch 微信触摸对象
     * @returns {Object} {x, y} 逻辑坐标
     */
    _getTouchCanvasPos(touch) {
      return {
        x: touch.x,
        y: touch.y
      };
    },

    /**
     * 检测触摸点是否在角点上
     * @param {Object} touchPos {x, y}
     * @returns {String|null} 角点 ID 或 null
     */
    _detectCorner(touchPos) {
      const { cropBox } = this.data;
      const { CORNER_SIZE, CORNER_TOLERANCE } = this.data.consts;
      const corners = [
        { id: 'tl', x: cropBox.x, y: cropBox.y },
        { id: 'tr', x: cropBox.x + cropBox.width, y: cropBox.y },
        { id: 'bl', x: cropBox.x, y: cropBox.y + cropBox.height },
        { id: 'br', x: cropBox.x + cropBox.width, y: cropBox.y + cropBox.height }
      ];

      for (let corner of corners) {
        const distance = Math.hypot(touchPos.x - corner.x, touchPos.y - corner.y);
        if (distance <= CORNER_SIZE + CORNER_TOLERANCE) { 
          console.log('[剪裁框] 检测到角点:', corner.id, '距离:', distance);
          return corner.id;
        }
      }
      console.log('[剪裁框] 未检测到角点');
      return null;
    },

    /**
     * 检测触摸点是否在剪裁框内部（非边框）
     * @param {Object} touchPos {x, y}
     * @returns {Boolean}
     */
    _isInsideCropBox(touchPos) {
      const { cropBox } = this.data;
      const inside = touchPos.x >= cropBox.x &&
                    touchPos.x <= cropBox.x + cropBox.width &&
                    touchPos.y >= cropBox.y &&
                    touchPos.y <= cropBox.y + cropBox.height;
      console.log('[剪裁框] 是否在内部:', inside);
      return inside;
    },

    /**
     * 剪裁框触摸开始
     */
    _onCropTouchStart(e) {
      const { touches } = e;
      if (!touches || touches.length !== 1) return;

      const touchPos = this._getTouchCanvasPos(touches[0]);
      const corner = this._detectCorner(touchPos);
      
      if (corner) {
        // 触摸到角点
        this.data.activeCorner = corner;
        this.data.isDraggingCrop = true;
        this.data.isDraggingBox = false;
        this.data.cropTouchStart = touchPos;
      } else if (this._isInsideCropBox(touchPos)) {
        // 触摸到剪裁框内部
        this.data.activeCorner = null;
        this.data.isDraggingCrop = false;
        this.data.isDraggingBox = true;
        this.data.cropTouchStart = touchPos;
      }
    },

    /**
     * 剪裁框触摸移动
     */
    _onCropTouchMove(e) {
      const { touches } = e;
      const { cropTouchStart, activeCorner, isDraggingCrop, isDraggingBox, cropBox, width, height } = this.data;
      
      if (!touches || touches.length !== 1 || !cropTouchStart) return;

      const currentPos = this._getTouchCanvasPos(touches[0]);
      const dx = currentPos.x - cropTouchStart.x;
      const dy = currentPos.y - cropTouchStart.y;

      let newCropBox = { ...cropBox };
      const minSize = this.data.consts.MIN_SIZE;

      if (isDraggingCrop && activeCorner) {
        // 拖拽角点调整大小
        switch (activeCorner) {
          case 'tl': // 左上角
            newCropBox.x = Math.max(0, cropBox.x + dx);
            newCropBox.y = Math.max(0, cropBox.y + dy);
            newCropBox.width = Math.max(minSize, cropBox.width - dx);
            newCropBox.height = Math.max(minSize, cropBox.height - dy);
            break;
          case 'tr': // 右上角
            newCropBox.y = Math.max(0, cropBox.y + dy);
            newCropBox.width = Math.max(minSize, cropBox.width + dx);
            newCropBox.height = Math.max(minSize, cropBox.height - dy);
            break;
          case 'bl': // 左下角
            newCropBox.x = Math.max(0, cropBox.x + dx);
            newCropBox.width = Math.max(minSize, cropBox.width - dx);
            newCropBox.height = Math.max(minSize, cropBox.height + dy);
            break;
          case 'br': // 右下角
            newCropBox.width = Math.max(minSize, cropBox.width + dx);
            newCropBox.height = Math.max(minSize, cropBox.height + dy);
            break;
        }
        // 限制不超过画布边界
        newCropBox.x = Math.min(newCropBox.x, width - minSize);
        newCropBox.y = Math.min(newCropBox.y, height - minSize);
        newCropBox.width = Math.min(newCropBox.width, width - newCropBox.x);
        newCropBox.height = Math.min(newCropBox.height, height - newCropBox.y);
      } else if (isDraggingBox) {
        // 拖拽整个剪裁框
        newCropBox.x = Math.max(0, Math.min(cropBox.x + dx, width - cropBox.width));
        newCropBox.y = Math.max(0, Math.min(cropBox.y + dy, height - cropBox.height));
      }

      // 更新剪裁框数据
      this.setData({
        cropBox: newCropBox,
        cropTouchStart: currentPos
      });

      // 节流重绘
      this.throttledDraw && this.throttledDraw();
    },

    /**
     * 剪裁框触摸结束
     */
    _onCropTouchEnd() {
      this.setData({
        activeCorner: null,
        isDraggingCrop: false,
        isDraggingBox: false,
        cropTouchStart: null
      });
    },

    /**
     * 生成剪裁后的图片本地临时文件路径
     * @returns {Promise} 返回临时文件路径或错误
     */
    _generateCroppedImage() {
      const { cropBox, imageObj, imageX, imageY, imageScale, imageRotation, dpr } = this.data;
      console.log('[剪裁框] 开始生成裁剪图片:', { imageObj, cropBox, imageObjType: typeof imageObj, imageObjWidth: imageObj?.width });

      // 验证所有依赖数据
      if (!imageObj || !imageObj.width || !imageObj.height) {
        console.error('[剪裁框] 图片未加载或无效:', { imageObj });
        return Promise.reject(new Error('[剪裁框] 图片未就绪'));
      }
      if (!cropBox || !cropBox.width || !cropBox.height) {
        console.error('[剪裁框] 剪裁框尺寸无效:', cropBox);
        return Promise.reject(new Error('[剪裁框] 剪裁框未初始化'));
      }

      // 创建离屏Canvas
      const tempCanvas = wx.createOffscreenCanvas({ type: '2d', width: cropBox.width * dpr, height: cropBox.height * dpr });
      const tempCtx = tempCanvas.getContext('2d');
      
      if (!tempCtx) {
        console.error('[剪裁框] 临时 Canvas 上下文创建失败');
        return Promise.reject(new Error('[剪裁框] 临时 Canvas 上下文异常'));
      }

      // 计算图片在剪裁框中的位置和尺寸
      const rad = (imageRotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      
      // 计算图片中心到剪裁框左上角的向量
      const dx = cropBox.x + cropBox.width / 2 - imageX;
      const dy = cropBox.y + cropBox.height / 2 - imageY;
      
      // 反向旋转向量，得到在图片坐标系中的位置
      const imgDx = dx * cos + dy * sin;
      const imgDy = -dx * sin + dy * cos;
      
      // 计算在图片上的实际位置（考虑缩放）
      const imgX = imageObj.width / 2 + imgDx / imageScale;
      const imgY = imageObj.height / 2 + imgDy / imageScale;
      
      // 计算剪裁区域在图片上的尺寸（考虑缩放）
      const imgWidth = cropBox.width / imageScale;
      const imgHeight = cropBox.height / imageScale;

      try {
        // 在临时Canvas上绘制剪裁区域
        tempCtx.drawImage(
          imageObj,
          imgX, imgY, imgWidth, imgHeight,
          0, 0, cropBox.width * dpr, cropBox.height * dpr
        );
        console.log('[剪裁框] 临时Canvas绘制成功');
      } catch (e) {
        console.error('[剪裁框] 临时Canvas绘制失败:', e);
        return Promise.reject(new Error('[剪裁框] 临时Canvas绘制异常'));
      }

      // 将离屏Canvas转为临时文件
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: tempCanvas,
          success: (res) => {
            console.log('[剪裁框] 生成临时文件成功:', res.tempFilePath);
            resolve(res.tempFilePath);
          },
          fail: (err) => {
            console.error('[剪裁框] 生成临时文件失败:', err);
            reject(err);
          }
        }, this);
      });
    }
  }
});