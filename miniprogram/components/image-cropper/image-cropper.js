// 微信小程序自定义组件：图片剪裁器主组件
// 负责 Canvas 初始化、模式切换和事件分发
// 使用两个 Behavior：image-behavior.js (图片处理) 和 crop-behavior.js (剪裁框处理)
Component({
  behaviors: [
    require('./image-behavior.js'),
    require('./crop-behavior.js')
  ],
  
  // 属性定义
  properties: {
    width: { type: Number, value: 350 },   // 画布宽度（逻辑像素）
    height: { type: Number, value: 350 },  // 画布高度（逻辑像素）
    boundaryPadding: { type: Number, value: 0 }, // 边界内边距（像素）
    imagePadding: { type: Number, value: 40 }   // 图片初始居中内边距
  },

  // 内部数据
  data: {
    isReady: false,      // 画布是否初始化完成
    dpr: 1,              // 设备像素比（仅用于 Canvas 初始化）
    canvasWidth: 0,      // 画布实际渲染宽度（CSS 像素）
    canvasHeight: 0,     // 画布实际渲染高度（CSS 像素）
    canvasRect: null     // Canvas 位置信息（用于触摸坐标转换）
  },

  // 生命周期函数
  lifetimes: {
    attached() {
      // 组件附加到页面节点树时执行
      console.log('[组件] 组件附加完成');
    },
    
    ready() {
      // 组件布局完成后初始化 Canvas
      this._initCanvas2D();
    },

    detached() {
      // 组件从页面节点树移除时执行，清理资源防止内存泄漏
      const { canvasNode, imageObj } = this.data;
      if (canvasNode) {
        canvasNode.destroy && canvasNode.destroy();
      }
      if (imageObj) {
        imageObj.src = '';
      }
    }
  },

  methods: {
    /**
     * 初始化 Canvas 2D 上下文（严格遵循官方文档）
     * @see https://developers.weixin.qq.com/miniprogram/dev/framework/ability/canvas.html
     */
    _initCanvas2D() {
      wx.createSelectorQuery()
        .in(this)
        .select('#cropperCanvas')
        .fields({ node: true, size: true, rect: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            console.error('[组件] Canvas 2D 节点查询失败');
            wx.showToast({ title: '画布加载失败', icon: 'none' });
            return;
          }
          
          const canvasNode = res[0].node;
          const ctx2d = canvasNode.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio || 1;

          const renderWidth = res[0].width;
          const renderHeight = res[0].height;
          canvasNode.width = renderWidth * dpr;
          canvasNode.height = renderHeight * dpr;
          ctx2d.scale(dpr, dpr);

          this.setData({ 
            ctx2d, 
            canvasNode,
            dpr,
            canvasWidth: renderWidth,
            canvasHeight: renderHeight,
            canvasRect: res[0].rect || { left: 0, top: 0, width: renderWidth, height: renderHeight } // 补充容错
          }, () => {
            console.log('[组件] Canvas 2D 初始化成功:', { width: renderWidth, height: renderHeight, dpr });
            console.log('[Canvas Rect] 实际值:', res[0].rect, '使用值:', this.data.canvasRect); // 补充日志
            this._initDrawFunction();
            this.triggerEvent('ready', { status: true });
          });
        });
    },

    /**
     * 初始化绘制函数，绑定节流
     */
    _initDrawFunction() {
      // 节流时间 8ms，更接近 120Hz 屏幕刷新率
      this.throttledDraw = this._throttle(this._drawCanvas.bind(this), 8);
      this._drawCanvas();
    },

    /**
     * 统一绘制函数：清空画布 → 绘制图片 → 自动绘制剪裁框（图片加载后）
     */
    _drawCanvas() {
      const { ctx2d, canvasWidth, canvasHeight, imageObj } = this.data;
      if (!ctx2d) return;

      ctx2d.clearRect(0, 0, canvasWidth, canvasHeight);
      this._drawImage();
      
      // 图片加载完成后自动初始化并绘制剪裁框
      if (imageObj && !this.data.cropBox.width && !this.data.cropBox.height) {
        this._initCropBox();
      }
      if (this.data.cropBox.width > 0 && this.data.cropBox.height > 0) {
        this._drawCropBox();
      }
    },

    /**
     * 节流函数：限制函数调用频率
     * @param {Function} func 要节流的函数
     * @param {Number} wait 等待时间（ms）
     */
    _throttle(func, wait) {
      let lastExecuteTime = 0;
      return function (...args) {
        const currentTime = Date.now();
        if (currentTime - lastExecuteTime > wait) {
          func.apply(this, args);
          lastExecuteTime = currentTime;
        }
      };
    },

    /**
     * 触摸开始事件分发，自动判断交互类型
     * @param {Object} e 触摸事件对象
     */
    _onTouchStart(e) {
      const { touches } = e;
      if (!touches || !this.data.imageObj) return;

      const touchPos = this._getTouchCanvasPos(touches[0]);
      const corner = this._detectCorner(touchPos);
      const isInside = this._isInsideCropBox(touchPos);

      if (touches.length === 1) {
        // 单指操作
        if (corner) {
          this.data.activeCorner = corner;
          this.data.isDraggingCrop = true;
          this.data.isDraggingBox = false;
        } else if (isInside) {
          this.data.activeCorner = null;
          this.data.isDraggingCrop = false;
          this.data.isDraggingBox = true;
        } else {
          this.data.activeCorner = null;
          this.data.isDraggingCrop = false;
          this.data.isDraggingBox = false;
          this._onImageTouchStart(e); // 移动图片
        }
        this.data.cropTouchStart = touchPos;
      } else if (touches.length === 2) {
        // 双指操作，始终缩放图片
        this._onImageTouchStart(e); // 初始化缩放状态
      }
    },

    /**
     * 触摸移动事件分发，自动判断交互类型
     * @param {Object} e 触摸事件对象
     */
    _onTouchMove(e) {
      const { touches } = e;
      if (!touches || !this.data.imageObj) return;

      if (touches.length === 1) {
        // 单指操作
        const { cropTouchStart, activeCorner, isDraggingCrop, isDraggingBox } = this.data;
        if (!cropTouchStart) return;

        const currentPos = this._getTouchCanvasPos(touches[0]);
        const dx = currentPos.x - cropTouchStart.x;
        const dy = currentPos.y - cropTouchStart.y;

        if (isDraggingCrop && activeCorner) {
          this._onCropTouchMove(e); // 调整剪裁框大小
        } else if (isDraggingBox) {
          this._onCropTouchMove(e); // 移动剪裁框
        } else {
          this._onImageTouchMove(e); // 移动图片
        }
        this.data.cropTouchStart = currentPos;
      } else if (touches.length === 2) {
        // 双指操作，始终缩放图片
        this._onImageTouchMove(e); // 缩放图片
      }
    },

    /**
     * 触摸结束事件分发，重置状态
     * @param {Object} e 触摸事件对象
     */
    _onTouchEnd(e) {
      if (this.data.isDraggingCrop || this.data.isDraggingBox) {
        this._onCropTouchEnd(e); // 重置剪裁框状态
      } else {
        this._onImageTouchEnd(e); // 重置图片状态
      }
    },

    // 对外接口
    chooseImage() { this._chooseImage(); },
    rotateImage() { this._rotateImage(); },
    resetImage() { this._resetImage(); },
    saveCroppedImage() { return this._saveCroppedImage(); }
  }
});