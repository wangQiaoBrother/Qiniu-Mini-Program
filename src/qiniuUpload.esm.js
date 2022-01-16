/**
 * 针对微信小程序、Vue、Taro、ES6写法的七牛云上传图片或者视频js包
 * 详细使用看README.md即可
 */
 let config = {
  /**
   * bucket 所在区域。ECN, SCN, NCN, NA, ASG，ECNZ分别对应七牛云的
   * 华东，华东浙2，华南，华北，北美，新加坡 6 个区域，后续新增的话再补充
   */
  qiniuRegion: '',
  /**
   * 七牛云bucket 外链前缀，外链在下载资源时用到 图片的下载域名前缀 http(s)://xxxx等
   */
  qiniuBucketURLPrefix: '',
  /**
   * 获取upToken方法二选一即可，执行优先级为：upToken > upTokenUrl
   * 二选一，推荐使用 qiniuUploadToken 外部传入token方式最好，详情请见 README.md
   */
  qiniuUploadToken: '',
  /**
   * 自己的请求token的服务地址，从指定 url 通过 HTTP GET 获取 upToken
   * 返回的格式必须是 json 且包含 upToken 字段，例如： {"upToken": "0MLvWPnyy..."}
   */
  qiniuUploadTokenUrl: ''
}
/**
 * 是否已经初始化过 正常只会初始化一次 假如token过期则需要再刷一次
 */
let configBool = false;
/**
 * 七牛云配置初始化
 */
function setConfig(options) {
  configBool = true
  if (!options || !options.region) {
    return Promise.reject('qiniu config params error')
  }
  const keys = {
    'region': 'qiniuRegion',
    'upToken': 'qiniuUploadToken',
    'upTokenUrl': 'qiniuUploadTokenUrl',
    'domain': 'qiniuBucketURLPrefix'
  }
  Object.keys(options).forEach(k => {
    keys[k] && (config[keys[k]] = options[k] || '')
  })
  return Promise.resolve()
}
/**
 * 选择七牛云文件上传接口，文件向匹配的接口中传输。
 * ECN, SCN, NCN, NA, ASG，ECNZ分别对应七牛云的：华东，华东浙2，华南，华北，北美，新加坡。6个区域
 * 新增的区域自行添加就行
 */
 function uploadURLFromRegionCode(code) {
  const map = new Map([
    ['ECN', 'https://upload.qiniup.com'],
    ['ECNZ', 'https://upload-cn-east-2.qiniup.com'],
    ['NCN', 'https://upload-z1.qiniup.com'],
    ['SCN', 'https://upload-z2.qiniup.com'],
    ['NA', 'https://upload-na0.qiniup.com'],
    ['ASG', 'https://upload-as0.qiniup.com']
  ])
  if (!map.has(code)) return Promise.reject('region code empty')
  return Promise.resolve(map.get(code))
}
/**
 * 二种方式获取token 
 */
 function getToken() {
  return new Promise(async (resolve, reject) => {
    // 第一种 直接赋值token
    if (config.qiniuUploadToken) {
      return resolve()
    }
    // 第二种 方法内request获取token
    if (config.qiniuUploadTokenUrl) {
      await getQiniuToken()
      return resolve()
    }
    reject('qiniu uploader need upToken or upTokenUrl');
  })
}
/**
 * 正式上传的前置方法，做预处理，初始化七牛云配置
 * filePath：上传的文件本地路径，options：初始化参数，update：是否需要更新初始化参数，
 * progress：上传进度函数，cancelTask：取消上传任务
 */
function upload({ filePath, options, update = false, progress, cancelTask }) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!filePath) {
        return reject('filePath is null');
      }
      if (options && (!configBool || update)) {
        await setConfig(options)
      }
      await getToken()
      const r = await doUpload({ filePath, options, progress, cancelTask });
      resolve(r)
    } catch (error) {
      reject(error)
    }
  })
}
/**
 * 执行上传函数
 */
function doUpload({ filePath, options, progress, cancelTask }) {
  return new Promise(async (resolve, reject) => {
    if (!config.qiniuUploadToken) {
      return reject('qiniu uploadToken is null, please check the init config or networking');
    }
    const url = await uploadURLFromRegionCode(config.qiniuRegion);
    let fileName = filePath.split('//')[1];
    // 自定义上传key（即自定义上传文件名）。通过修改qiniuUploader.upload方法传入的options参数，可以进行自定义文件名称。
    // 如果options非空，则使用options中的key作为fileName
    if (options && options.key) fileName = options.key;
    let formData = { 'token': config.qiniuUploadToken };
    // qiniuShouldUseQiniuFileName 如果是 true，则文件的 key 由 qiniu 服务器分配（全局去重）。
    // 如果是 false，则文件的 key 使用微信自动生成的 filename。出于初代sdk用户升级后兼容问题的考虑，默认是 false。
    if (!config.qiniuShouldUseQiniuFileName) { formData['key'] = fileName };
    const uploadTask = wx.uploadFile({
      url: url,
      filePath,
      name: 'file',
      formData,
      success: (res) => {
        try {
          if (res.statusCode !== 200) return reject(res);
          const dataString = res.data;
          const dataObject = JSON.parse(dataString);
          // 拼接fileURL 不管是qiniuShouldUseQiniuFileName true还是false 都需要拼接
          dataObject.imageUrl = `${config.qiniuBucketURLPrefix}/${dataObject.key}`;
          resolve(dataObject);
        } catch (e) {
          reject(e);
        }
      },
      fail: (error) => {
        reject(error);
      }
    })
    // 文件上传进度
    uploadTask.onProgressUpdate((res) => {
      progress && progress(res);
    })
    // 中断文件上传
    cancelTask && cancelTask(() => {
      uploadTask.abort();
    })
  })
}
/**
 * 获取七牛云upToken, url为后端服务器获取七牛云upToken接口
 * 这种形式接口返回参数格式必须严格按照下面来
 * data: { upToken: '32131232', domain: 'http(s)://xxxx', region: 'ECN' }
 */
function getQiniuToken() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.qiniuUploadTokenUrl,
      success: (res) => {
        const token = res.data.upToken;
        if (token && token.length > 0) {
          config.qiniuUploadToken = token;
          config.qiniuBucketUrlPreFix = res.data.domain;
          config.qiniuRegion = res.data.region;
          return resolve()
        }
        reject('qiniuUploader cannot get your token, please check the upTokenUrl or server')
      },
      fail: (error) => {
        reject('qiniu UploadToken is null, please check the init config or networking: ' + error)
      }
    })
  })
}
export default {
  setConfig,
  upload
}