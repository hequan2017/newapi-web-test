# New API form-data 视频提交失败处理参考

## 现象

Sora 视频创建接口按官方文档使用：

- `POST /v1/videos`
- `Content-Type: multipart/form-data`
- 字段包含 `model`、`prompt`、`duration`、`width`、`height`、`fps`、`n`、`metadata`

但 New API 返回类似错误：

```json
{
  "code": "fail_to_fetch_task",
  "message": "{\"code\":\"video_pricing_error\",\"message\":\"failed to parse video params: failed to parse request body: invalid character '-' in numeric literal\",\"data\":null}",
  "data": null
}
```

## 根因判断

这个错误通常不是上游 Sora 接口拒绝请求，而是 New API 在转发前的计费解析阶段失败。

`multipart/form-data` 的请求体会包含边界，例如：

```text
------WebKitFormBoundary...
```

如果 New API 的视频计费逻辑按 JSON 去解析 multipart 原始 body，就会先读到 `-`，于是报：

```text
invalid character '-' in numeric literal
```

错误码里的 `video_pricing_error` 也说明失败点在视频价格/计费参数解析。

## 推荐解决方案：改成固定价格计费

如果当前 New API 版本的视频计费层不能正确解析 `multipart/form-data`，可以把这个 Sora 视频模型配置成固定价格/按次计费，避免计费层继续解析 `duration`、`width`、`height` 等请求体参数。

配置思路：

1. 进入 New API 管理后台。
2. 找到系统设置里的倍率/价格配置。
3. 为当前 Sora 视频模型配置固定价格，也就是官方文档里的“按次计费模型（固定价格）”。
4. 不再依赖视频动态计费参数解析。
5. 保存后重新用表单 `multipart/form-data` 提交测试。

参考官方文档：

- Sora 创建视频接口：`https://www.newapi.ai/zh/docs/api/ai-model/videos/sora/createvideo`
- 倍率设置/固定价格说明：`https://docs.newapi.pro/zh/docs/guide/feature-guide/admin/system-setting-advanced`

## 验证步骤

1. 前端使用“表单提交”。
2. 请求路径保持 `/v1/videos`。
3. 浏览器 Network 里确认请求是 `multipart/form-data; boundary=...`。
4. 如果不再返回 `video_pricing_error`，说明固定价格配置绕过了 multipart 计费解析问题。
5. 如果仍然失败，说明当前 New API 版本可能在转发链路里还有其他 multipart 解析问题，需要升级 New API 或修改后端解析逻辑。

## 风险和取舍

- 固定价格可以绕过 multipart 计费解析失败。
- 代价是不能按视频时长、分辨率、帧率做精确动态计费。
- 如果必须按 `duration/width/height/fps` 精确计费，需要 New API 后端支持从 multipart form 字段解析视频参数，而不是按 JSON body 解析。

## 前端注意事项

浏览器发送 `FormData` 时不要手动设置：

```js
Content-Type: multipart/form-data
```

应让浏览器自动生成带 `boundary` 的 header。否则服务端也可能无法正确解析 multipart body。

