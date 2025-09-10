// image-cropper.js
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
    mode: { type: String, value: 'image' }, // 当前模式：'image' 编辑图片 / 'crop' 剪裁模式
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
     * 统一绘制函数：清空画布 → 绘制图片 → 绘制剪裁框（如启用）
     */
    _drawCanvas() {
      const { ctx2d, canvasWidth, canvasHeight } = this.data;
      if (!ctx2d) return;

      ctx2d.clearRect(0, 0, canvasWidth, canvasHeight);
      this._drawImage();
      
      if (this.data.mode === 'crop') {
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
     * 触摸开始事件分发
     * @param {Object} e 触摸事件对象
     */
    _onTouchStart(e) {
      const { mode } = this.data;
      if (mode === 'crop') {
        this._onCropTouchStart(e);
      } else {
        this._onImageTouchStart(e);
      }
    },

    /**
     * 触摸移动事件分发
     * @param {Object} e 触摸事件对象
     */
    _onTouchMove(e) {
      const { mode } = this.data;
      if (mode === 'crop') {
        this._onCropTouchMove(e);
      } else {
        this._onImageTouchMove(e);
      }
    },

    /**
     * 触摸结束事件分发
     * @param {Object} e 触摸事件对象
     */
    _onTouchEnd(e) {
      const { mode } = this.data;
      if (mode === 'crop') {
        this._onCropTouchEnd(e);
      } else {
        this._onImageTouchEnd(e);
      }
    },

    // 对外接口
    chooseImage() { this._chooseImage(); },
    rotateImage() { this._rotateImage(); },
    resetImage() { this._resetImage(); },
    saveCroppedImage() { return this._saveCroppedImage(); },

    /**
     * 切换模式
     * @param {Object} e 事件对象，包含 data-mode
     */
    switchMode(e) {
      const mode = e.currentTarget.dataset.mode;
      this.setData({ mode }, () => {
        this.throttledDraw && this.throttledDraw();
      });
    }
  }
});