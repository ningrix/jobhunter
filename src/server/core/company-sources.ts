/**
 * 企业官方招聘入口目录（V4.1 前置：官方招聘导航）。
 *
 * 定位：只做「官方入口直达」，不抓取、不代投、不存任何平台凭证——与 Agent 安全红线一致。
 * 数据为公开的官方招聘站点 URL（事实数据），本文件自主维护；
 * `verified: true` 表示该 URL 已核对为该公司/平台官方站点且探活可达（2026-10-05 批量 curl 探活，
 * 200/301/302 且跳转目标为官方招聘页方计为通过）；false 表示探活失败或被站点防护拦截（浏览器
 * 通常可正常打开），UI 必须向用户明示「待验证」，避免误导航。修正直接改本文件（静态单一维护处，
 * 与 job-sources/core/site-catalog.ts 同惯例）。
 */

export const COMPANY_CATEGORIES = [
  "互联网",
  "人工智能",
  "智能硬件",
  "新能源与出行",
  "游戏与内容",
  "小而美",
  "银行",
  "招聘平台",
] as const;

export type CompanyCategory = (typeof COMPANY_CATEGORIES)[number];

export interface CompanySource {
  id: string;
  name: string;
  /** 官方招聘主站（社招/综合）；主站为官网首页时由 note 指引「人才招聘」栏目 */
  url: string;
  /** 校招专页（存在时 UI 优先展示校招入口） */
  campusUrl?: string;
  category: CompanyCategory;
  /** 一句话说明（自主撰写） */
  note?: string;
  verified: boolean;
}

export const COMPANY_SOURCES: CompanySource[] = [
  // ———— 互联网 ————
  { id: "tencent", name: "腾讯", url: "https://careers.tencent.com", campusUrl: "https://join.qq.com", category: "互联网", note: "校招走 join.qq.com，社招走 careers.tencent.com", verified: true },
  { id: "alibaba", name: "阿里巴巴", url: "https://talent.alibaba.com", campusUrl: "https://campus.alibaba.com", category: "互联网", note: "集团统一招聘入口，校招单独入口", verified: true },
  { id: "alibaba-cloud", name: "阿里云", url: "https://careers.aliyun.com", category: "互联网", note: "阿里云与钉钉岗位主要在此发布", verified: true },
  { id: "bytedance", name: "字节跳动", url: "https://jobs.bytedance.com", category: "互联网", note: "含飞书、抖音、火山引擎等岗位", verified: true },
  { id: "meituan", name: "美团", url: "https://zhaopin.meituan.com", category: "互联网", note: "到店/到家/无人机/机器人等", verified: true },
  { id: "jd", name: "京东", url: "https://campus.jd.com", category: "互联网", note: "京东集团校招主入口", verified: true },
  { id: "baidu", name: "百度", url: "https://talent.baidu.com", category: "互联网", note: "含文心/自动驾驶等岗位线", verified: true },
  { id: "netease", name: "网易", url: "https://campus.163.com", category: "互联网", note: "网易集团校招（游戏另有入口）", verified: true },
  { id: "pinduoduo", name: "拼多多", url: "https://careers.pddglobalhr.com", category: "互联网", note: "拼多多/Temu 全球招聘站", verified: true },
  { id: "xiaohongshu", name: "小红书", url: "https://job.xiaohongshu.com", category: "互联网", note: "社区/电商/广告技术岗", verified: true },
  { id: "kuaishou", name: "快手", url: "https://zhaopin.kuaishou.cn", category: "互联网", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "iflytek", name: "科大讯飞", url: "https://campus.iflytek.com", category: "互联网", note: "AI 技术岗集中", verified: true },
  { id: "zhihu", name: "知乎", url: "https://careers.zhihu.com", category: "互联网", verified: true },
  { id: "didi", name: "滴滴", url: "https://careers.didiglobal.com", category: "互联网", note: "含花小猪、滴滴货运等业务线", verified: true },
  { id: "antgroup", name: "蚂蚁集团", url: "https://talent.antgroup.com", category: "互联网", note: "支付宝等生态岗位，校招同站发布", verified: true },
  { id: "ctrip", name: "携程集团", url: "https://job.ctrip.com", campusUrl: "https://campus.ctrip.com", category: "互联网", note: "集团统一招聘入口，校招单独入口", verified: true },
  { id: "qunar", name: "去哪儿", url: "https://campus.qunar.com", category: "互联网", note: "校招入口，跳转官方飞书招聘页；社招请搜索官网", verified: true },
  { id: "wuba", name: "58同城", url: "https://campus.58.com", category: "互联网", note: "校招主入口（跳转官方招聘页）", verified: true },
  { id: "weibo-sina", name: "微博（新浪）", url: "https://career.sina.com.cn", category: "互联网", note: "新浪/微博集团社招入口；校招见官方公告", verified: true },
  { id: "iqiyi", name: "爱奇艺", url: "https://campus.iqiyi.com", category: "互联网", note: "校招入口", verified: true },
  { id: "autohome", name: "汽车之家", url: "https://campus.autohome.com.cn", category: "互联网", note: "待验证：汽车内容/数据服务头部", verified: false },
  { id: "yiche", name: "易车", url: "https://campus.yiche.com", category: "互联网", verified: true },
  { id: "tongcheng", name: "同程旅行", url: "https://campus.ly.com", category: "互联网", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "suning", name: "苏宁易购", url: "https://campus.suning.com", category: "互联网", note: "待验证：站点有访问防护，浏览器一般可正常打开", verified: false },
  { id: "vipshop", name: "唯品会", url: "https://campus.vip.com", category: "互联网", note: "校招入口（跳转官方招聘页）", verified: true },
  { id: "zhuanzhuan", name: "转转集团", url: "https://campus.zhuanzhuan.com", category: "互联网", verified: true },
  { id: "huolala", name: "货拉拉", url: "https://campus.huolala.cn", category: "互联网", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "sohu", name: "搜狐", url: "https://campus.sohu.com", category: "互联网", note: "校招主入口", verified: true },
  { id: "tme", name: "腾讯音乐娱乐", url: "https://campus.tencentmusic.com", category: "互联网", note: "待验证：QQ音乐/酷狗等所在集团", verified: false },
  { id: "mgtv", name: "芒果TV", url: "https://campus.hunantv.com", category: "互联网", note: "待验证：湖南广电旗下", verified: false },
  { id: "kingsoft-office", name: "金山办公", url: "https://join.wps.cn", category: "互联网", note: "WPS 校招主入口", verified: true },
  { id: "yonyou", name: "用友", url: "https://campus.yonyou.com", category: "互联网", note: "待验证：企业软件头部", verified: false },
  { id: "kingdee", name: "金蝶", url: "https://campus.kingdee.com", category: "互联网", note: "校招主入口（跳转官方招聘页）", verified: true },
  { id: "eastmoney", name: "东方财富", url: "https://campus.eastmoney.com", category: "互联网", verified: true },
  { id: "ths", name: "同花顺", url: "https://campus.10jqka.com.cn", category: "互联网", verified: true },
  { id: "dewu", name: "得物", url: "https://careers.dewu.com", campusUrl: "https://campus.dewu.com", category: "互联网", note: "社招/校招双入口", verified: true },
  { id: "qihoo-360", name: "360 集团", url: "https://campus.360.cn", category: "互联网", note: "校招入口", verified: true },
  { id: "douban", name: "豆瓣", url: "https://jobs.douban.com", category: "互联网", verified: true },
  { id: "hello-group", name: "挚文集团", url: "https://campus.hellogroup.com", category: "互联网", note: "陌陌/探探母公司，校招主入口", verified: true },
  { id: "soul", name: "Soul App", url: "https://campus.soulapp.cn", category: "互联网", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "tuhu", name: "途虎养车", url: "https://campus.tuhu.cn", category: "互联网", note: "待验证：汽车养护连锁", verified: false },
  { id: "sf", name: "顺丰集团", url: "https://campus.sf-express.com", category: "互联网", note: "校招入口，含顺丰科技等岗位", verified: true },
  { id: "duxiaoman", name: "度小满金融", url: "https://campus.duxiaoman.com", category: "互联网", note: "百度系金融科技", verified: true },
  { id: "ziroom", name: "自如", url: "https://campus.ziroom.com", category: "互联网", note: "待验证：站点有访问防护，浏览器一般可正常打开", verified: false },
  { id: "ke", name: "贝壳找房", url: "https://campus.ke.com", category: "互联网", note: "校招主入口，含链家/被窝家装", verified: true },

  // ———— 人工智能 ————
  { id: "sensetime", name: "商汤科技", url: "https://hr.sensetime.com", category: "人工智能", note: "社招入口；校招见官网校招页", verified: true },
  { id: "megvii", name: "旷视科技", url: "https://www.megvii.com", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "cloudwalk", name: "云从科技", url: "https://www.cloudwalk.cn", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "4paradigm", name: "第四范式", url: "https://www.4paradigm.com", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "horizon", name: "地平线", url: "https://campus.horizon.cc", category: "人工智能", note: "待验证：智驾芯片头部", verified: false },
  { id: "cambricon", name: "寒武纪", url: "https://www.cambricon.com", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "zhipu", name: "智谱AI", url: "https://www.zhipuai.cn", category: "人工智能", note: "GLM 系列大模型，官网『加入我们』", verified: true },
  { id: "moonshot", name: "月之暗面", url: "https://www.moonshot.cn", category: "人工智能", note: "Kimi 研发方，官网『加入我们』", verified: true },
  { id: "minimax", name: "MiniMax", url: "https://www.minimaxi.com", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "baichuan", name: "百川智能", url: "https://www.baichuan-ai.com", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "lingyi-wanwu", name: "零一万物", url: "https://www.lingyiwanwu.com", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "stepfun", name: "阶跃星辰", url: "https://www.stepfun.com", category: "人工智能", note: "官网『加入我们』", verified: true },
  { id: "deepseek", name: "深度求索", url: "https://www.deepseek.com", category: "人工智能", note: "DeepSeek 大模型研发方，官网『加入我们』", verified: true },
  { id: "modelbest", name: "面壁智能", url: "https://www.modelbest.cn", category: "人工智能", note: "MiniCPM 系列研发方，官网『加入我们』", verified: true },

  // ———— 智能硬件 ————
  { id: "huawei", name: "华为", url: "https://career.huawei.com", category: "智能硬件", note: "天才少年/校招/社招统一入口", verified: true },
  { id: "honor", name: "荣耀", url: "https://career.honor.com", category: "智能硬件", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "xiaomi", name: "小米", url: "https://hr.xiaomi.com", category: "智能硬件", note: "含小米汽车/大家电岗位", verified: true },
  { id: "oppo", name: "OPPO", url: "https://careers.oppo.com", category: "智能硬件", verified: true },
  { id: "vivo", name: "vivo", url: "https://hr.vivo.com", category: "智能硬件", verified: true },
  { id: "dji", name: "大疆", url: "https://we.dji.com", category: "智能硬件", note: "无人机/影像/机器人", verified: true },
  { id: "boe", name: "京东方 BOE", url: "https://campus.boe.com.cn", category: "智能硬件", note: "待验证：面板/半导体显示", verified: false },
  { id: "zte", name: "中兴通讯", url: "https://campus.zte.com.cn", category: "智能硬件", note: "待验证：通信设备头部", verified: false },
  { id: "hikvision", name: "海康威视", url: "https://campus.hikvision.com", category: "智能硬件", note: "待验证：安防龙头", verified: false },
  { id: "dahua", name: "大华股份", url: "https://campus.dahuatech.com", category: "智能硬件", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "tp-link", name: "普联 TP-LINK", url: "https://hr.tp-link.com.cn", category: "智能硬件", note: "校招可在站内进入校园招聘栏目", verified: true },
  { id: "lenovo", name: "联想集团", url: "https://campus.lenovo.com.cn", category: "智能硬件", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "roborock", name: "石头科技", url: "https://campus.roborock.com", category: "智能硬件", note: "待验证：扫地机器人头部", verified: false },
  { id: "dreame", name: "追觅科技", url: "https://campus.dreame.com", category: "智能硬件", note: "待验证：智能清洁赛道", verified: false },
  { id: "insta360", name: "影石 Insta360", url: "https://campus.insta360.com", category: "智能硬件", note: "待验证：全景影像设备", verified: false },
  { id: "shokz", name: "韶音科技", url: "https://www.shokz.com.cn", category: "智能硬件", note: "骨传导耳机头部，官网『加入我们』", verified: true },
  { id: "anker", name: "安克创新", url: "https://campus.anker.com", category: "智能硬件", note: "待验证：跨境电商消费电子", verified: false },
  { id: "ecovacs", name: "科沃斯", url: "https://hr.ecovacs.cn", category: "智能硬件", note: "服务机器人头部，招聘主入口", verified: true },
  { id: "tuya", name: "涂鸦智能", url: "https://campus.tuya.com", category: "智能硬件", note: "IoT 开发者平台", verified: true },
  { id: "transsion", name: "传音控股", url: "https://campus.transsion.com", category: "智能硬件", note: "待验证：非洲手机市场龙头", verified: false },

  // ———— 新能源与出行 ————
  { id: "byd", name: "比亚迪", url: "https://campus.byd.com", category: "新能源与出行", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "catl", name: "宁德时代", url: "https://campus.catl.com", category: "新能源与出行", note: "待验证：动力电池/储能", verified: false },
  { id: "lixiang", name: "理想汽车", url: "https://campus.lixiang.com", category: "新能源与出行", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "nio", name: "蔚来", url: "https://campus.nio.com", category: "新能源与出行", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "xiaopeng", name: "小鹏汽车", url: "https://campus.xiaopeng.com", category: "新能源与出行", note: "待验证：智驾/整车研发", verified: false },
  { id: "geely", name: "吉利控股", url: "https://campus.geely.com", category: "新能源与出行", note: "校招主入口（跳转官方招聘页）", verified: true },
  { id: "zeekr", name: "极氪汽车", url: "https://www.zeekrlife.com", category: "新能源与出行", note: "官网『加入我们』，校招另见官方公告", verified: true },
  { id: "leapmotor", name: "零跑汽车", url: "https://www.leapmotor.com", category: "新能源与出行", note: "官网『加入我们』", verified: true },
  { id: "gwm", name: "长城汽车", url: "https://www.gwm.com.cn", category: "新能源与出行", note: "官网『加入我们』", verified: true },
  { id: "tesla-cn", name: "特斯拉中国", url: "https://www.tesla.cn/careers", category: "新能源与出行", note: "官方招聘页（上海超级工厂等）", verified: true },

  // ———— 游戏与内容 ————
  { id: "miHoYo", name: "米哈游", url: "https://campus.mihoyo.com", category: "游戏与内容", note: "原神/崩铁/绝区零研发团队", verified: true },
  { id: "bilibili", name: "哔哩哔哩", url: "https://hr.bilibili.com", campusUrl: "https://campus.bilibili.com", category: "游戏与内容", verified: true },
  { id: "netease-game", name: "网易游戏", url: "https://game.campus.163.com", category: "游戏与内容", note: "游戏单独校招入口", verified: true },
  { id: "wanmei", name: "完美世界", url: "https://www.wanmei.com", category: "游戏与内容", note: "游戏+影视，官网『加入我们』", verified: true },
  { id: "37games", name: "三七互娱", url: "https://www.37.com", category: "游戏与内容", note: "官网『加入我们』", verified: true },
  { id: "kunlun", name: "昆仑万维", url: "https://www.kunlun.com", category: "游戏与内容", note: "含天工大模型，官网『加入我们』", verified: true },
  { id: "giant", name: "巨人网络", url: "https://hr.ztgame.com", category: "游戏与内容", note: "跳转官方招聘申请页", verified: true },

  // ———— 小而美（优质中型公司代表） ————
  { id: "hypergryph", name: "鹰角网络", url: "https://campus.hypergryph.com", category: "小而美", note: "明日方舟研发团队，校招主入口", verified: true },
  { id: "lilith", name: "莉莉丝游戏", url: "https://www.lilith.com", category: "小而美", note: "剑与远征/万国觉醒，官网『加入我们』", verified: true },
  { id: "papegames", name: "叠纸游戏", url: "https://campus.papegames.com", category: "小而美", note: "待验证：恋与制作人/无限暖暖研发团队", verified: false },
  { id: "xd", name: "心动公司", url: "https://www.xd.com", category: "小而美", note: "TapTap/心动游戏，官网『加入我们』", verified: true },
  { id: "keep", name: "Keep", url: "https://campus.gotokeep.com", category: "小而美", note: "校招入口；社招见 hr.gotokeep.com", verified: true },
  { id: "youzan", name: "有赞", url: "https://campus.youzan.com", category: "小而美", note: "校招入口", verified: true },
  { id: "weimob", name: "微盟集团", url: "https://www.weimob.com", category: "小而美", note: "官网『加入我们』", verified: true },
  { id: "pingcap", name: "PingCAP", url: "https://campus.pingcap.com", category: "小而美", note: "TiDB 研发方，校招主入口", verified: true },
  { id: "agora", name: "声网 Agora", url: "https://www.shengwang.cn", category: "小而美", note: "实时互动云服务商，官网『加入我们』", verified: true },
  { id: "sangfor", name: "深信服", url: "https://www.sangfor.com.cn", category: "小而美", note: "网络安全/云服务，官网『加入我们』", verified: true },

  // ———— 银行 ————
  { id: "bank-icbc", name: "工商银行", url: "https://job.icbc.com.cn", category: "银行", note: "官方人才招聘站（校招/社招）", verified: true },
  { id: "bank-ccb", name: "建设银行", url: "https://job.ccb.com", category: "银行", note: "官方人才招聘站", verified: true },
  { id: "bank-abc", name: "农业银行", url: "https://www.abchina.com", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-boc", name: "中国银行", url: "https://www.bankofchina.com", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-bocom", name: "交通银行", url: "https://job.bankcomm.com", category: "银行", note: "官方人才招聘站", verified: true },
  { id: "bank-psbc", name: "邮储银行", url: "https://www.psbc.com", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-cmb", name: "招商银行", url: "https://career.cmbchina.com", category: "银行", note: "官方招聘站", verified: true },
  { id: "bank-citic", name: "中信银行", url: "https://job.citicbank.com", category: "银行", note: "官方人才招聘站", verified: true },
  { id: "bank-spdb", name: "浦发银行", url: "https://job.spdb.com.cn", category: "银行", note: "官方人才招聘站", verified: true },
  { id: "bank-cmbc", name: "民生银行", url: "https://www.cmbc.com.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-ceb", name: "光大银行", url: "https://www.cebbank.com", category: "银行", note: "待验证：站点有访问防护，浏览器一般可正常打开", verified: false },
  { id: "bank-cib", name: "兴业银行", url: "https://job.cib.com.cn", category: "银行", note: "官方人才招聘站", verified: true },
  { id: "bank-hxb", name: "华夏银行", url: "https://www.hxb.com.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-cgb", name: "广发银行", url: "https://www.cgbchina.com.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-pa", name: "平安银行", url: "https://career.pingan.com", category: "银行", note: "待验证：平安集团统一招聘站，如跳转异常请以官网公告为准", verified: false },
  { id: "bank-cz", name: "浙商银行", url: "https://www.czbank.com.cn", category: "银行", note: "待验证：如跳转异常请以官网公告为准", verified: false },
  { id: "bank-bobj", name: "北京银行", url: "https://www.bankofbeijing.com.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-bosc", name: "上海银行", url: "https://www.bosc.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-jsb", name: "江苏银行", url: "https://www.jsbchina.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-nbcb", name: "宁波银行", url: "https://www.nbcb.com.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-hzb", name: "杭州银行", url: "https://www.hzbank.com.cn", category: "银行", note: "官网首页 →『人才招聘』栏目", verified: true },
  { id: "bank-webank", name: "微众银行", url: "https://job.webank.com", campusUrl: "https://campus.webank.com", category: "银行", note: "民营银行；社招/校招双入口", verified: true },
  { id: "bank-mybank", name: "网商银行", url: "https://www.mybank.cn", category: "银行", note: "民营银行；官网首页 →『人才招聘』栏目", verified: true },

  // ———— 招聘平台（第三方，区别于企业官方入口） ————
  { id: "boss", name: "BOSS直聘", url: "https://www.zhipin.com", category: "招聘平台", note: "直聊模式综合招聘平台", verified: true },
  { id: "zhilian", name: "智联招聘", url: "https://www.zhaopin.com", category: "招聘平台", note: "老牌综合招聘平台", verified: true },
  { id: "job51", name: "前程无忧", url: "https://www.51job.com", category: "招聘平台", verified: true },
  { id: "liepin", name: "猎聘", url: "https://www.liepin.com", category: "招聘平台", note: "中高端人才平台", verified: true },
  { id: "lagou", name: "拉勾招聘", url: "https://www.lagou.com", category: "招聘平台", note: "互联网行业垂直平台", verified: true },
  { id: "shixiseng", name: "实习僧", url: "https://www.shixiseng.com", category: "招聘平台", note: "实习/校招垂直平台", verified: true },
  { id: "nowcoder", name: "牛客", url: "https://www.nowcoder.com", category: "招聘平台", note: "校招笔经/内推/题库社区", verified: true },
  { id: "maimai", name: "脉脉", url: "https://maimai.cn", category: "招聘平台", note: "职场社交+招聘", verified: true },
  { id: "iguopin", name: "国聘", url: "https://www.iguopin.com", category: "招聘平台", note: "央企国企招聘主平台", verified: true },
  { id: "yingjiesheng", name: "应届生求职网", url: "https://www.yingjiesheng.com", category: "招聘平台", note: "校招信息聚合（前程无忧旗下）", verified: true },
  { id: "haitou", name: "海投网", url: "https://www.haitou.cc", category: "招聘平台", note: "校招宣讲会/职位聚合", verified: true },
];

export function listCompanySources(filter?: { category?: CompanyCategory; keyword?: string }): CompanySource[] {
  let items = COMPANY_SOURCES;
  if (filter?.category) items = items.filter((c) => c.category === filter.category);
  if (filter?.keyword) {
    const kw = filter.keyword.trim().toLowerCase();
    if (kw) {
      items = items.filter(
        (c) => c.name.toLowerCase().includes(kw) || (c.note ?? "").toLowerCase().includes(kw),
      );
    }
  }
  return items;
}

export function getCompanySource(id: string): CompanySource | undefined {
  return COMPANY_SOURCES.find((c) => c.id === id);
}
