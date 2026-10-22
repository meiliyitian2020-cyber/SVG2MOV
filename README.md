# SVG2MOV

[下载最新 Windows 版](https://github.com/meiliyitian2020-cyber/SVG2MOV/releases/latest) · [自动构建状态](https://github.com/meiliyitian2020-cyber/SVG2MOV/actions)

完整源码、测试素材与构建脚本保存在本仓库。EXE、ZIP、源码压缩包及 SHA-256 校验值由 Windows Actions 构建后发布到 Releases。

## SVGA 转透明 MOV（Windows 10/11 x64）

## 使用
1. 双击 `SVGA-MOV-Exporter-1.2.0.exe`。
2. 拖入一个或多个 `.svga` 文件，自动顺序导出。也可点“选择 SVGA 文件”。
3. 在源文件所在目录获得 `原文件名_mov导出.mov`。

例如 `礼物.svga` → `礼物_mov导出.mov`。已存在时自动使用 `礼物_mov导出 (1).mov`，不会覆盖原文件。

## 默认设置
- 内容分辨率：SVGA 原尺寸。
- 画布扩充：四周每侧 200 px；例如原尺寸 500×500，默认输出 900×900。
- 帧率：SVGA 原帧率（设置中的 0）。
- 编码：MOV 容器内的 PNG 无损编码，RGBA 透明通道。
- PNG 压缩级别：6；0–9 全部无损，级别仅影响速度和大小，不设置目标码率。
- 循环：1 次。
- 输出目录：每个源文件自己的目录。

设置支持 0.5/1/1.5/2/3/4 倍分辨率、自定义帧率、PNG 压缩级别、ProRes 4444、循环次数及指定输出目录。
设置保存后用于之后加入的任务；已排队任务保持加入时的设置。退出后保留设置，可点“恢复默认”。
提高帧率使用原帧采样/重复，不是 AI 补帧。提高分辨率不会补回原位图缺失的细节。

## 导入 AE
将 MOV 导入工程。PNG MOV 保留直通（未预乘）RGBA。若需要手动解释 Alpha，选择“直通（无杂色）”。
部分系统播放器把透明画面显示为黑底；可在 AE 的透明网格上确认 Alpha。
SVGA 含内嵌音频时自动合入 MOV，没有音频时不添加音轨。按 startFrame/endFrame 和 startTime 定位、裁剪和混合；循环导出会同步循环音频。音频使用 48 kHz、24-bit PCM 立体声。
文件中的真实背景图层属于画面内容，会保留；工具不会把背景颜色抠掉。

## 运行
便携 EXE，无需安装 Python、Node 或 FFmpeg，无需联网。首次运行会将运行文件解包到临时目录。
普通用户权限运行即可。任务结束后可点“打开所在目录”。
取消会清理该任务的临时输出，已完成文件保留；失败信息显示在队列中。

## 1.2.0 画布扩充
- 新增“每侧扩充”参数，默认 200 px，可设为 0–4096。
- 扩大实际渲染画布，在绘制每个原始图层时平移坐标；能够显示仍保存在文件中、原画布外的图形。
- 不缩小主体，不把已被裁切的视频画面补透明边。缺失的原始像素和文件内部遮罩裁掉的部分无法恢复。
- 扩充量按最终输出像素计算；2 倍分辨率配合 200 px 扩充时，500×500 输出 1400×1400。
- 保留 PNG 无损、RGBA、原帧率及 1.1.0 的内嵌音频功能。
- 旧设置缺少扩充参数时自动采用 200 px，恢复默认也为 200 px。
- 验证：四边越界图层、完全在原画布外的图层重新可见；中央像素逐一不变；原始图层遮罩仍生效；0/200 px、1/2 倍尺寸和音频一致性通过。

## 1.1.0 音频更新
- 自动提取 SVGA 内嵌音频，支持多个片段的延迟、重叠、裁剪和循环。
- 音视频时长统一；合入声音时直接复制视频流，画面不会再次编码。
- 源文件声明了音频但资源缺失/损坏时显示错误，避免静默丢音。
- WAV + MP3 双轨样例：验证静音区间、200ms 源偏移、片段重叠及两轮循环逐样本一致。

## 已验证范围
- SVGA 2.0 protobuf 和旧版 ZIP/movie.spec 样例完整转换。
- 65×63（奇数尺寸）、12 fps、12 帧、1 秒 → PNG/RGBA MOV。
- 核对透明背景、50% Alpha、颜色、位置和帧数。
- 2 倍尺寸、24 fps、2 次循环 → ProRes 4444 透明 MOV，48 帧、2 秒。
- 界面默认值、IPC 文件入队、后台渲染及文件自动避让。
- Windows x64 产物交叉打包；没有在真实 Windows 上进行启动或 AE 导入测试。

## 从源码构建
需要 Windows x64 + Node.js 24 LTS。
1. `npm ci`
2. `node node_modules/electron/install.js`
3. `powershell -ExecutionPolicy Bypass -File scripts/prepare-ffmpeg.ps1`
4. `npm run build:win`

产物在 `dist-1.2`。`npm test` 执行核心参数和时间采样测试。
FFmpeg 下载脚本校验 SHA-256，构建时不依赖机器上已有的 FFmpeg。
第三方组件及许可证见 `THIRD_PARTY.txt`、`LICENSE` 及 `app/*LICENSE*`。

## GitHub 自动构建

首次上传、修改 package.json 或构建工作流后，main 分支自动运行 Windows 测试、构建并发布当前版本；也可以在 Actions → Build and release Windows → Run workflow 手动运行。已有版本的 Release 不会被覆盖，重跑结果保留在对应 Actions 的 Artifacts 中。发布新版本时更新 package.json 版本及 EXE 名称。
