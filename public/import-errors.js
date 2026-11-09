export function importErrorMessage(error) {
  const message=typeof error?.message==='string'?error.message:'';
  if(/toHex|toBase64|fromBase64|withResolvers|is not a function|dynamically imported module/i.test(message)) {
    return '浏览器的文件解析组件未能正常运行，请刷新页面后重试，或使用最新版 Chrome。也可直接粘贴简历文本。';
  }
  // 应用自己的校验信息保留；解析库的内部异常不直接展示给求职者。
  if(/[\u3400-\u9fff]/.test(message))return message;
  return '文件提取失败，可能已损坏、加密或当前浏览器不支持。请换文件重试，或直接粘贴文本。';
}
