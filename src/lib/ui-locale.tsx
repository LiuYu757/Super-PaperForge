'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type UiLocale = 'en' | 'zh-CN';

const STORAGE_KEY = 'paperforge-ui-locale';

const zh: Record<string, string> = {
  'Projects': '项目', 'Templates': '模板', 'Billing': '账单', 'Docs': '文档',
  'Settings': '设置', 'Editor': '编辑器', 'Admin': '管理', 'Profile': '个人资料',
  'Security': '安全', 'Notifications': '通知', 'Appearance': '外观',
  'Keyboard Shortcuts': '键盘快捷键', 'Help': '帮助', 'Sign out': '退出登录',
  'Toggle Theme': '切换主题', 'Language': '语言', 'English': 'English', '简体中文': '简体中文',
  'Manage your account, preferences, and application settings.': '管理账户、编辑偏好和应用设置。',
  'Profile Information': '个人资料', 'Display Name': '显示名称', 'Email Address': '邮箱地址',
  'Institution': '机构', 'Bio': '简介', 'Storage': '存储空间', 'Used': '已使用',
  'Change Password': '修改密码', 'Current Password': '当前密码', 'New Password': '新密码',
  'Confirm Password': '确认密码', 'Delete Account': '删除账户',
  'Editor Preferences': '编辑器偏好', 'Font Size': '字体大小', 'Tab Size': '缩进宽度',
  'Key Bindings': '快捷键方案', 'Auto-Save Interval': '自动保存间隔',
  'Word Wrap': '自动换行', 'Line Numbers': '行号', 'Auto-Compile': '自动编译',
  'Default Compiler': '默认编译器', 'Email Notifications': '邮件通知',
  'Project Invitations': '项目邀请', 'Compilation Complete': '编译完成',
  'Version Restored': '版本恢复', 'Theme': '主题', 'Light': '浅色',
  'Dark': '深色', 'System': '跟随系统', 'Save Profile': '保存资料',
  'Save Preferences': '保存偏好', 'Save Notifications': '保存通知设置',
  'Saving...': '保存中…', 'Saved!': '已保存！', 'Change': '更换',
  'Upload': '上传', 'Remove': '移除', 'Show password': '显示密码',
  'Hide password': '隐藏密码', 'Weak': '弱', 'Fair': '一般',
  'Good': '良好', 'Strong': '强', 'Very Strong': '很强',
  'Compile': '编译', 'Compiling...': '编译中…', 'Compiling': '编译中',
  'Success': '成功', 'Error': '错误', 'Output': '输出', 'PDF': 'PDF',
  'History': '历史版本', 'Git': 'Git', 'Outline': '大纲',
  'Open a file from the sidebar': '从侧栏打开文件',
  'Select a file from the sidebar to start editing': '从侧栏选择文件开始编辑',
  'Auto: ON': '自动：开', 'Auto: OFF': '自动：关',
  'Download PDF': '下载 PDF', 'Loading PDF...': '正在加载 PDF…',
  'Failed to load PDF': 'PDF 加载失败', 'Retry': '重试',
  'Update your personal details. This information may be visible to collaborators.': '更新个人信息；协作者可能看到这些内容。',
  'PNG, JPG, GIF, WebP · 2 MB max': '支持 PNG、JPG、GIF、WebP，最大 2 MB',
  'This is how your name will appear to collaborators.': '协作者将看到这个名称。',
  'Your email is used for login and cannot be changed.': '此邮箱用于登录，暂不支持修改。',
  'Your university, company, or research institution.': '填写大学、公司或研究机构。',
  'A brief description shown on your profile. Markdown is not supported.': '显示在个人资料中的简介，不支持 Markdown。',
  'Your file storage usage.': '文件存储用量。',
  'Update your password to keep your account secure. Passwords must be at least 8 characters.': '更新密码以保护账户，密码至少需要 8 个字符。',
  'Confirm New Password': '确认新密码', 'Passwords match': '密码一致',
  'Passwords do not match': '两次密码不一致', 'Danger Zone': '危险操作',
  'Irreversible and destructive actions.': '这些操作无法撤销。',
  'Permanently delete your account and all associated data. This action cannot be undone.': '永久删除账户和相关数据，此操作无法撤销。',
  'Are you absolutely sure?': '确定要删除吗？', 'Current password': '当前密码',
  'Type': '输入', 'to confirm': '以确认', 'Cancel': '取消',
  'Customize how the code editor looks and behaves.': '调整代码编辑器的外观与行为。',
  'Editor font size in pixels.': '编辑器字体大小，单位为像素。',
  'Number of spaces per tab.': '每级缩进使用的空格数。',
  'Default': '默认', 'Keyboard shortcut scheme for the editor.': '编辑器的快捷键方案。',
  '1 second': '1 秒', '2 seconds': '2 秒', '5 seconds': '5 秒',
  '10 seconds': '10 秒', 'Disabled': '关闭',
  'How often your work is automatically saved.': '自动保存的时间间隔。',
  'Wrap long lines to fit the editor width': '长行随编辑器宽度换行',
  'Show line numbers in the editor gutter': '在编辑器边栏显示行号',
  'Automatically compile the document after saving': '保存后自动编译文档',
  'The LaTeX engine used for new projects by default.': '新项目默认使用的 LaTeX 引擎。',
  'Choose which events trigger email notifications.': '选择需要邮件通知的事件。',
  'Receive an email when someone invites you to a project': '有人邀请你加入项目时发送邮件',
  'Get notified when a long-running compilation finishes': '耗时较长的编译完成时发送通知',
  'Get notified when a collaborator restores a previous version of a project': '协作者恢复项目旧版本时发送通知',
  'Select a theme for the application. Choose "System" to follow your operating system preference.': '选择应用主题。“跟随系统”会使用操作系统的主题设置。',
  'Saving theme preference...': '正在保存主题设置…',
  'Your name': '你的姓名', 'University or organization': '大学或机构',
  'Tell others a little about yourself...': '简单介绍一下自己…',
  'Enter your current password': '输入当前密码', 'Enter a new password': '输入新密码',
  'Confirm your new password': '再次输入新密码',
  'My Projects': '我的项目', 'Shared': '共享项目', 'All': '全部',
  'Recently Modified': '最近修改', 'Name A-Z': '名称 A–Z',
  'Name Z-A': '名称 Z–A', 'Date Created': '创建时间',
  'No matching projects': '没有匹配的项目', 'Clear filters': '清除筛选',
  "Try adjusting your search or filter to find what you're looking for.": '请调整搜索词或筛选条件。',
  'Create Your First Project': '创建第一个项目',
  'Get started by creating a LaTeX project. You can write papers, theses, presentations, and more.': '创建 LaTeX 项目后，你可以撰写论文、学位论文、演示文稿等。',
  'Failed to load projects': '无法加载项目',
  "We couldn't fetch your projects. Please check your connection and try again.": '无法获取项目，请检查网络后重试。',
  'Create, manage, and collaborate on your LaTeX documents.': '创建、管理和协作编辑 LaTeX 文档。',
  'Search projects...': '搜索项目…', 'Grid view': '网格视图', 'List view': '列表视图',
  'New Project': '新建项目', 'Create Project': '创建项目', 'Creating...': '创建中…',
  'Start a new LaTeX project. You can invite collaborators later.': '新建 LaTeX 项目，稍后可以邀请协作者。',
  'Project Name': '项目名称', 'My LaTeX Paper': '我的 LaTeX 论文',
  'Compiler': '编译器',
  'pdfLaTeX is recommended for most documents. Use XeLaTeX or LuaLaTeX for Unicode fonts.': '多数文档推荐使用 pdfLaTeX；使用 Unicode 字体时请选择 XeLaTeX 或 LuaLaTeX。',
  'Upgrade Plan': '升级套餐', 'Project name is required': '请输入项目名称',
  'Failed to create project': '创建项目失败', 'Something went wrong': '发生错误',
  'Import': '导入', 'Import Project': '导入项目', 'Importing...': '导入中…',
  'Import an existing LaTeX project from a ZIP file or GitHub repository.': '从 ZIP 文件或 GitHub 仓库导入 LaTeX 项目。',
  'ZIP File': 'ZIP 文件', 'GitHub URL': 'GitHub 地址', '(optional)': '（可选）',
  'Auto-detected from source': '从来源自动识别',
  'Download from Overleaf → Menu → Source → Upload here.': '在 Overleaf 中选择“菜单 → 源文件”下载，再上传到这里。',
  'GitHub Repository URL': 'GitHub 仓库地址',
  'Public repositories only. Imports the main/master branch.': '仅支持公开仓库，默认导入 main/master 分支。',
  'Please select a ZIP file': '请选择 ZIP 文件',
  'Please enter a GitHub URL': '请输入 GitHub 地址', 'Import failed': '导入失败',
  'Changing...': '修改中…', 'Deleting...': '删除中…',
  'Delete My Account': '删除我的账户',
  'This will permanently delete your account, all your projects, files, and collaboration data. This action is irreversible.': '这会永久删除你的账户及所有项目、文件和协作数据，无法撤销。',
  'Password must be at least 8 characters': '密码至少需要 8 个字符',
  'Password changed successfully!': '密码修改成功！',
  'Preferences saved locally.': '偏好设置已保存在本地。',
  'Theme saved locally.': '主题设置已保存在本地。',
  'owner': '所有者', 'editor': '编辑者', 'viewer': '查看者',
  'Open': '打开', 'Rename': '重命名', 'Add Tag': '添加标签',
  'Duplicate': '复制', 'Share': '共享', 'Delete': '删除',
  'Click again to confirm': '再次点击以确认',
  'Download': '下载', 'Copy Path': '复制路径',
  'Set as Main Document': '设为主文档', 'New Folder': '新建文件夹',
  'Delete Folder': '删除文件夹', 'OK': '确定', 'Create': '创建',
  'No files yet': '暂无文件',
  'Create a new file or upload one to get started': '新建或上传文件以开始',
  'Filter files... ( / )': '筛选文件…（/）',
  'Subfolder in': '子文件夹，位于', 'Folder name': '文件夹名称',
  'Log': '日志', 'error': '错误', 'errors': '错误',
  'warning': '警告', 'warnings': '警告',
  '(click errors in log to see line numbers)': '点击日志中的错误可查看行号',
  'No lines match your current filters.': '没有符合当前筛选条件的日志。',
  'No compilation output yet': '暂无编译输出', 'Click': '点击',
  'or start typing to trigger auto-compile.': '，或继续输入以触发自动编译。',
  'Latest': '最新', 'No PDF preview yet': '暂无 PDF 预览',
  'Press': '按',
  'to compile, or enable auto-compile in the toolbar': '开始编译，或在工具栏开启自动编译',
  'lines': '行', 'words': '词', 'chars': '字符',
  'Goal': '目标', 'Set': '设置', 'Compiled': '已编译',
  'Modified': '已修改', 'Saved': '已保存',
  'success': '成功', 'compiling': '编译中',
  'Symbols': '符号', 'Cite': '引用', 'Math': '数学',
  'Table': '表格', 'Eq': '公式', 'Stats': '统计',
  'Diff': '差异', 'Ref': '参考',
};

type LocaleContextValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (text: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function UiLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>('en');

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(STORAGE_KEY); } catch { /* private browsing */ }
    setLocaleState(stored === 'en' || stored === 'zh-CN'
      ? stored
      : navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale(next) {
      setLocaleState(next);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* session only */ }
    },
    t: (text) => locale === 'zh-CN' ? zh[text] ?? text : text,
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useUiLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useUiLocale must be used inside UiLocaleProvider');
  return context;
}
