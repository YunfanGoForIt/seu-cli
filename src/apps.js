export const APPS = {
  course: {
    title: '我的课表',
    wid: '831556292223983616',
    path: '/jwapp/sys/wdkb/'
  },
  grade: {
    title: '成绩查询',
    wid: '831556292710522880',
    path: '/jwapp/sys/cjcx/'
  },
  exam: {
    title: '我的考试安排',
    wid: '831556329574260736',
    path: '/jwapp/sys/studentWdksapApp/'
  }
};

export const PORTAL_URL = 'https://i.seu.edu.cn/default/index.html#/';
export const EHALL_HOST = 'https://ehall.seu.edu.cn';
export const GROUP_TITLE = '东南大学校园服务';

export function serviceShowUrl(wid) {
  return `https://i.seu.edu.cn/default/index.html#/ServiceShow?isMobile=0&wid=${wid}`;
}
