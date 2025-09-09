// image-cropper.js 代码
Component({
  behaviors: [
    require('./image-behavior.js'),
    require('./crop-behavior.js')
  ],
  
  properties: {
    width: { type: Number, value: 350 },   // 画布宽度（逻辑像素）
    height: { type: Number, value: 350 },  // 画布高度（逻辑像素）
    mode: { type: String, value: 'image' }, // 当前模式：'image' 编辑图片 / 'crop' 剪裁模式
    boundaryPadding: { type: Number, value: 0 } // ✅ 新增：边界内边距配置（像素），图片至少留多少在画布内
  },

  data: {
    isReady: false,      // 画布是否初始化完成
    dpr: 1,              // 设备像素比（仅用于 Canvas 初始化）
    canvasWidth: 0,      // 画布实际渲染宽度（CSS 像素）
    canvasHeight: 0      // 画布实际渲染高度（CSS 像素）
    // ✅ 移除：canvasRect，不再需要
  },

  lifetimes: {
    attached() {
      console.log('[组件] 组件附加完成');
    },
    
    ready() {
      // 组件布局完成后，初始化 Canvas 2D
      this._initCanvas2D();
    }
  },

  methods: {
    /**
     * 初始化 Canvas 2D 上下文（严格遵循官方文档）
     * 官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/ability/canvas.html
     */
    _initCanvas2D() {
      wx.createSelectorQuery()
        .in(this)
        .select('#cropperCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            console.error('[组件] Canvas 2D 节点查询失败');
            wx.showToast({ title: '画布加载失败', icon: 'none' });
            return;
          }
          
          const canvasNode = res[0].node;
          const ctx2d = canvasNode.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio || 1;

          // ✅ 官方标准：逻辑尺寸 = 渲染尺寸 × DPR
          const renderWidth = res[0].width;
          const renderHeight = res[0].height;
          canvasNode.width = renderWidth * dpr;
          canvasNode.height = renderHeight * dpr;
          ctx2d.scale(dpr, dpr);

          // 保存数据
          this.setData({ 
            ctx2d, 
            canvasNode,
            dpr,
            canvasWidth: renderWidth,    // 存储渲染尺寸（CSS 像素）
            canvasHeight: renderHeight,
            isReady: true
          }, () => {
            console.log('[组件] Canvas 2D 初始化成功');
            this._initDrawFunction();
            this.triggerEvent('ready', { status: true });
          });
        });
    },

    /**
     * 初始化绘制函数，绑定节流
     */
    _initDrawFunction() {
      // ✅ 节流时间 8ms，适合高刷新
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

    // ✅ 移除：_updateCanvasRect()，不再需要

    /**
     * 触摸开始事件分发
     */
    _onTouchStart(e) {
      // ✅ 移除 _updateCanvasRect()
      const { mode } = this.data;
      if (mode === 'crop') {
        this._onCropTouchStart(e);
      } else {
        this._onImageTouchStart(e);
      }
    },

    /**
     * 触摸移动事件分发
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

    switchMode(mode) {
      this.setData({ mode }, () => {
        this.throttledDraw && this.throttledDraw();
      });
    }
  }
});