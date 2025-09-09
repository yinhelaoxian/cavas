module.exports = Behavior({
  // ✅ 修正：必须使用 data: { ... } 语法
  data: {
    // 剪裁框数据（逻辑坐标）
    cropBox: { x: 50, y: 50, width: 200, height: 200 },
    
    // 剪裁框触摸状态
    activeCorner: null,    // 当前激活的角点：'tl', 'tr', 'bl', 'br'
    isDraggingCrop: false, // 是否正在拖拽角点调整大小
    isDraggingBox: false,  // 是否正在拖拽整个剪裁框
    cropTouchStart: null,  // 触摸开始时的坐标
    cornerSize: 12         // 角点控制点半径
  },

  methods: {
    /**
     * 绘制剪裁框（遮罩层 + 边框 + 网格 + 角点）
     */
    _drawCropBox() {
      const { ctx2d, cropBox, cornerSize, width, height } = this.data;
      if (!ctx2d) return;

      // 保存状态
      ctx2d.save();

      // 绘制半透明遮罩层
      ctx2d.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx2d.fillRect(0, 0, width, height);

      // “挖空”剪裁区域
      ctx2d.globalCompositeOperation = 'destination-out';
      ctx2d.fillRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
      ctx2d.globalCompositeOperation = 'source-over'; // 恢复默认合成模式
      ctx2d.restore();

      // 绘制剪裁框边框
      ctx2d.strokeStyle = '#ffffff';
      ctx2d.lineWidth = 2;
      ctx2d.strokeRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);

      // 绘制网格线（九宫格辅助线）
      ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx2d.lineWidth = 1;
      
      // 竖直网格线
      for (let i = 1; i < 3; i++) {
        const x = cropBox.x + (cropBox.width / 3) * i;
        ctx2d.beginPath();
        ctx2d.moveTo(x, cropBox.y);
        ctx2d.lineTo(x, cropBox.y + cropBox.height);
        ctx2d.stroke();
      }
      
      // 水平网格线
      for (let i = 1; i < 3; i++) {
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
        ctx2d.arc(corner.x, corner.y, cornerSize, 0, 2 * Math.PI);
        ctx2d.fill();
        ctx2d.stroke();
      });
    },

    /**
     * 将触摸坐标转换为逻辑坐标（除以 DPR）
     * @param {Object} touch 微信触摸对象
     * @returns {Object} {x, y} 逻辑坐标
     */
    _getTouchCanvasPos(touch) {
      const { canvasRect, dpr } = this.data;
      if (!canvasRect || !dpr) return { x: 0, y: 0 };
      return {
        x: (touch.clientX - canvasRect.left) / dpr,
        y: (touch.clientY - canvasRect.top) / dpr
      };
    },

    /**
     * 检测触摸点是否在某个角点上
     * @param {Object} touchPos {x, y}
     * @returns {String|null} 角点 ID 或 null
     */
    _detectCorner(touchPos) {
      const { cropBox, cornerSize } = this.data;
      const corners = [
        { id: 'tl', x: cropBox.x, y: cropBox.y },
        { id: 'tr', x: cropBox.x + cropBox.width, y: cropBox.y },
        { id: 'bl', x: cropBox.x, y: cropBox.y + cropBox.height },
        { id: 'br', x: cropBox.x + cropBox.width, y: cropBox.y + cropBox.height }
      ];
      
      for (let corner of corners) {
        const distance = Math.hypot(touchPos.x - corner.x, touchPos.y - corner.y);
        if (distance <= cornerSize + 5) { // 增加 5px 容错
          return corner.id;
        }
      }
      return null;
    },

    /**
     * 检测触摸点是否在剪裁框内部（非边框）
     * @param {Object} touchPos {x, y}
     * @returns {Boolean}
     */
    _isInsideCropBox(touchPos) {
      const { cropBox } = this.data;
      return touchPos.x >= cropBox.x && 
             touchPos.x <= cropBox.x + cropBox.width &&
             touchPos.y >= cropBox.y && 
             touchPos.y <= cropBox.y + cropBox.height;
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
        this.setData({
          activeCorner: corner,
          isDraggingCrop: true,
          isDraggingBox: false,
          cropTouchStart: touchPos
        });
      } else if (this._isInsideCropBox(touchPos)) {
        // 触摸到剪裁框内部
        this.setData({
          activeCorner: null,
          isDraggingCrop: false,
          isDraggingBox: true,
          cropTouchStart: touchPos
        });
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
      const minSize = 50; // 最小尺寸

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
     * 保存剪裁后的图片
     * @returns {Promise} 返回临时文件路径
     */
    _saveCroppedImage() {
      const { cropBox, imageObj, imageX, imageY, imageScale, imageRotation } = this.data;
      
      if (!imageObj) {
        wx.showToast({ title: '请先选择图片', icon: 'none' });
        return Promise.reject(new Error('图片未准备好'));
      }

      return new Promise((resolve, reject) => {
        // 创建离屏 Canvas
        const tempCanvas = wx.createOffscreenCanvas({ type: '2d' });
        tempCanvas.width = cropBox.width;
        tempCanvas.height = cropBox.height;
        const tempCtx = tempCanvas.getContext('2d');

        // 保存状态
        tempCtx.save();

        // 计算图片在剪裁区域中的偏移
        const offsetX = imageX - cropBox.x;
        const offsetY = imageY - cropBox.y;

        // 计算图片中心点（相对于剪裁区域）
        const imgCenterX = offsetX + (imageObj.width * imageScale) / 2;
        const imgCenterY = offsetY + (imageObj.height * imageScale) / 2;

        // 应用变换
        tempCtx.translate(imgCenterX, imgCenterY);
        tempCtx.rotate((imageRotation * Math.PI) / 180);

        // 绘制图片
        tempCtx.drawImage(
          imageObj,
          -(imageObj.width * imageScale) / 2,
          -(imageObj.height * imageScale) / 2,
          imageObj.width * imageScale,
          imageObj.height * imageScale
        );

        tempCtx.restore();

        // 导出图片
        wx.canvasToTempFilePath({
          canvas: tempCanvas,
          success: (res) => {
            console.log('[剪裁] 保存成功:', res.tempFilePath);
            wx.showToast({ title: '保存成功', icon: 'success' });
            resolve(res.tempFilePath);
          },
          fail: (err) => {
            console.error('[剪裁] 保存失败:', err);
            wx.showToast({ title: '保存失败', icon: 'none' });
            reject(err);
          }
        });
      });
    }
  }
});