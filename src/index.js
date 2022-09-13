const axios = require('axios');
const argv = require('yargs').argv;
const querystring = require('querystring');

function get(url) {
  return axios.default
    .request({
      headers: {
        referer: 'https://www.microsoftstore.com.cn/student/edu-refurbished-surface',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.104 Safari/537.36',
      },
      url,
      method: 'GET',
    })
    .then(res => res.data);
}

function sleep(sleepTime) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, sleepTime);
  });
}

function weixinNotify(key, logDesc, logDesp) {
  const data = {
    title: logDesc,
    desp: logDesp,
  };
  const dataStr = querystring.stringify(data);
  return axios.default.post(`https://sctapi.ftqq.com/${key}.send`, dataStr).then(res => res.data);
}

function formatDate(date, fmt) {
  const o = {
    'y+': date.getFullYear(), // 年份
    'M+': date.getMonth() + 1, // 月份
    'd+': date.getDate(), // 日
    'h+': date.getHours() % 12 === 0 ? 12 : date.getHours() % 12, // 12小时制
    'H+': date.getHours(), // 24小时制
    'm+': date.getMinutes(), // 分
    's+': date.getSeconds(), // 秒
    'q+': Math.floor((date.getMonth() + 3) / 3), // 季度
    'f+': date.getMilliseconds(), // 毫秒
  };
  for (const k in o) {
    if (new RegExp('(' + k + ')').test(fmt)) {
      fmt = fmt.replace(RegExp.$1, o[k].toString().padStart(RegExp.$1.length, '0'));
    }
  }
  return fmt;
}

let LAST_PRODUCTS_VARIANTS = [];

async function run(wantToBuyProductNameRegex = /Surface Go/, sizeRegex = /128GB/) {
  const startDate = new Date();
  while (true) {
    try {
      const dateNow = new Date();
      if ((dateNow - startDate) / 1000 / 60 > 75) {
        break;
      }
      console.group(formatDate(dateNow, 'yyyy/MM/dd HH:mm:ss fff : '));
      const result = await get(
        `https://www.microsoftstore.com.cn/graphql?query=%7B+categoryList(filters%3A+%7Bids%3A+%7Bin%3A+%5B%2267%22%5D%7D%7D)+%7B+id+name+absolute_path+store+price_sort+products(pageSize%3A20+currentPage%3A1+sort%3A+%7Bposition%3AASC%7D)+%7B+total_count+items%7B+id+private_description+sku+name+marketing_txt+marketing_status+image+%7B+label+url+%7D+private_price+qty_status+super_attribute+%7B+code+label+index+%7D...+on+BundleProduct+%7B+url_key+dynamic_sku+dynamic_price+dynamic_weight+price_view+ship_bundle_items+items+%7B+title+required+type+main+bundle_type+position+sku+options+%7B+quantity+position+is_default+private_price+price_type+can_change_quantity+label+product+%7Bid+edu_bundle_message+qty_status+name+image+%7B+label+url+%7D+qty_status+sku+__typename%7D%7D%7D%7D...+on+ConfigurableProduct+%7B+variants+%7B+attributes+%7B+code+label+value_index+%7D+product+%7B+id+sku+private_description+name+sub_name+marketing_txt+marketing_status+image+%7B+label+url+%7D+private_price+qty_status+color+size+%7D+%7D+%7D+%7D+%7D+%7D+%7D&_=${Date.now()}`
      );
      const products = result.data.categoryList[0].products.items;
      if (products && products.length > 0) {
        // 当前可买的,按价格从低到高
        console.clear();
        let isAlreadyNotify = false;
        const productVariants = products
          .filter(item => item.sku !== '2571-00000')
          .map(x => x.items[0].options)
          .reduce((acc, cur) => acc.concat(cur), [])
          .filter(x => x.private_price && x.product.qty_status === 'true')
          .map(x => {
            return {
              ...x,
              price: Number(x.private_price.replace('￥ ', '').replace(',', '')),
            };
          })
          .sort((a, b) => a.price - b.price);

        productVariants.forEach(x => console.log(`${x.product.name}: ${x.private_price}`));
        if (LAST_PRODUCTS_VARIANTS.length > 0) {
          const priceCutProducts = productVariants.filter(
            x => x.product.qty_status === 'true' && LAST_PRODUCTS_VARIANTS.some(old => old.product.sku === x.product.sku && x.price < old.price)
          );
          if (priceCutProducts.length > 0) {
            let notifyMsg = `####  以下Surface 已降价：\r\n\r\n${priceCutProducts.map(x => `> ${x.product.name} ${x.private_price}`).join('\r\n\r\n')}`; //`${wantToBuyProduct.name} 已到货:\r\n${canBuyProducts.map(x => `${x.product.sub_name} ${x.product.private_price}`).join('\r\n')}`;
            console.group('notifyMsg : ');
            console.log(notifyMsg);
            console.groupEnd();
            const notifyResult = await weixinNotify(argv.wxkey, '微软教育优惠降价通知', notifyMsg);
            console.log(`notifyResult : `, notifyResult);
            isAlreadyNotify = true;
          }
        }
        LAST_PRODUCTS_VARIANTS = productVariants;

        const wantToBuyProducts = products.filter(x => wantToBuyProductNameRegex.test(x.name));
        if (wantToBuyProducts && wantToBuyProducts.length > 0) {
          for (const wantToBuyProduct of wantToBuyProducts) {
            if (wantToBuyProduct.items && wantToBuyProduct.items[0].options.length > 0) {
              let canBuyProducts = wantToBuyProduct.items[0].options.filter(x => x.product.qty_status === 'true');
              if (canBuyProducts.length > 0 && sizeRegex) {
                canBuyProducts = canBuyProducts.filter(x => sizeRegex.test(x.product.name));
              }
              if (canBuyProducts.length > 0) {
                let notifyMsg = `####  ${wantToBuyProduct.name} 已到货：\r\n\r\n${canBuyProducts.map(x => `> ${x.product.name} ${x.private_price}`).join('\r\n\r\n')}`; //`${wantToBuyProduct.name} 已到货:\r\n${canBuyProducts.map(x => `${x.product.sub_name} ${x.product.private_price}`).join('\r\n')}`;
                console.group('notifyMsg : ');
                console.log(notifyMsg);
                console.groupEnd();
                const notifyResult = await weixinNotify(argv.wxkey, '微软教育优惠到货通知', notifyMsg);
                console.log(`notifyResult : `, notifyResult);
                isAlreadyNotify = true;
              }
            }
          }
        }
        if (isAlreadyNotify) {
          break;
        }
      } else {
        break;
      }
      console.groupEnd();
    } catch (error) {
      console.error(error);
    }
    await sleep(Math.random() * 1000);
  }
}

run(/Surface Laptop 3/, /512GB/);
