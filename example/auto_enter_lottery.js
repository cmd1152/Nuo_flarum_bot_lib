/*
  auto_enter_lottery 自动参与抽奖
  请使用前先设置环境变量 remeber 为你的 Cookie 的 flarum_remember 项 （在登录时勾选“记住我”）
*/


const Client = require('../Nuo_flarum_bot_lib'); // 导入库

const options = {
  url: 'https://www.nodeloc.com/', // 论坛地址
  auth: {
    type: 'cookie', // cookie 登录
    cookie: 'flarum_remember=' + process.env.remeber
  }
};

const nodeloc = new Client(options); // 打开一个客户端
const entered = []; // 记录已经参与的帖子
var waitenter = []; // 等待被参与的帖子


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enter(pid, autopost = false) { // 确认抽奖
  let req = await nodeloc.fetch(`/api/nodeloc/lottery/${pid}/enter`, {
    method: "POST",
    headers: {
      "x-http-method-override": "PATCH"
    }
  })
  let data = await req.json();
  if (data.errors) {
    if (data.errors[0].detail == "您已经参与了此抽奖.") {
        console.log(`| | 您已经参与过此抽奖！`);
      return true;
    }
    if (data.errors[0].detail == "参与抽奖请先回复主题答谢抽奖发起者.") {
      if (autopost) {
        console.log(`| | 正在回复此抽奖帖子...`);
        let post_req = await nodeloc.fetch(`/api/posts`, {
          headers: {
            "content-type": "application/json; charset=UTF-8",
          },
          method: 'POST',
          body: JSON.stringify({
            data: {
              type: "posts",
              attributes: {
                content: "来参与参与抽奖了~"
              },
              relationships: {
                discussion: {
                  data: {
                    type: "discussions",
                    id: autopost
                  }
                }
              }
            }
          }) 
        })
        let post_ret = await post_req.json();
        if (post_ret.errors) {
          console.error(`| | 已触发频率限制！ 6s 后重试！`);
          await sleep(6 * 1000);
          return enter(pid, autopost);
        }
        return enter(pid);
      } else console.error(`| | 需要回复才可以参与，但是没有被允许回复`);
      return false;
    }
    console.error(data.errors);
    return false;
  }
  return true;
  
}

async function getDiscussions(num = 100) { // 获取主题列表
  let req = await nodeloc.fetch(`/api/discussions?page%5Blimit%5D=${num}`);
  let data = await req.json();
  return data.data || false;
}

async function enterLoop() {
  let pid = waitenter.shift();
  if (!pid) return;
  console.log("");
  console.log(`正在参与 ${pid}`);
  console.log(`| 获取 Payload`);
  let data = await nodeloc.getPayload(`/d/${pid}`);
  if (!data) console.error(`| 获取 Payload 失败`);
  // 抠出来抽奖的信息
  console.log(`| 获取抽奖信息`);
  let lotteryInfo = data.apiDocument.included.find(block => block.type == "lottery");
    console.log(
      `| 抽奖 ${pid} 的信息：\n` + 
      `| | ID: ${lotteryInfo.id}\n` +
      `| | ${lotteryInfo.attributes.prizes} x${lotteryInfo.attributes.amount}\n` + 
      `| | Price: ${lotteryInfo.attributes.price}, ${lotteryInfo.attributes.min_participants} < ${lotteryInfo.attributes.enter_count} < ${lotteryInfo.attributes.max_participants}\n` +
      `| | EndTime: ${lotteryInfo.attributes.endDate}`
    )
  // 判断价格是否小于等于 100 而且没结束还可以Enter
  if (lotteryInfo.attributes.canEnter) {
    if (lotteryInfo.attributes.price <= 100) {
      console.log(`| 正在参与...`)
      if (await enter(lotteryInfo.id, pid)) {
        console.log(`| 成功！`);
        entered.push(pid);
      } else console.log(`| 失败！`)
    } else {
      console.log(`| 不打算参与 ${pid}`);
      entered.push(pid);
    }
  } else {
    console.log(`| 此抽奖已结束`);
    entered.push(pid);
  }


  enterLoop();
}


async function searchLottery() {
  let discussions = await getDiscussions();
  if (!discussions) return console.error("获取帖子列表失败");
  let hasLottery = discussions.filter((discussion) => 
    discussion.attributes.hasLottery > 0     && 
    !entered.includes(discussion.id)         && 
    !waitenter.includes(discussion.id)
  );
  hasLottery
    .map((discussion) => discussion.id)
    .forEach((id) => waitenter.push(id));

  enterLoop();
}

console.log("已开始运行，将自动按设定的值自动参与抽奖！");


setInterval(searchLottery, 60 * 1000);
searchLottery();
