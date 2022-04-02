# Pasar-Assist-Service
The assist service keep synchrozing all collectibles from Pasar contract on bockchain to deployable server as an intermediate service for 3rd applications to browse all collectible data.

## 部署

### 安装nodejs mongodb pm2

```bash
$ sudo apt-get update

$ curl -fsSL https://deb.nodesource.com/setup_14.x | sudo -E bash -
$ sudo apt-get install -y nodejs

$ sudo apt-get install mongodb

$ sudo npm install -g pm2
$ sudo pm2 install pm2-intercom
```
> 本例假设用户使用 `Ubuntu 18.04` 其他安装方式参考官方文档

### 创建数据库

```bash
$ mongo
> use feeds_sources;
> db.pasar_order.createIndex({orderId: 1}, {unique: true});
> db.pasar_token.createIndex({tokenId: 1}, {unique: true});
```

### 运行服务

```bash
git clone https://github.com/elastos-trinity/pasar-assist-service.git
cd pasar-assist-service
npm install
pm2 start bin/www
```

## API

### Pasar API

调用URL: `https://example.com/pasar/api/v1`

1. 注册

```
url:          /register
method:       POST
content-type: application/json
parameter:    tokenId (必填)
              name (必填)
              description (选填)
              author (选填)
              created (选填)
              updated (选填)
              price (选填)
              currency (选填)
              likes(选填)
              thumnail(选填)
              
response:     {"code": 200, "message": "success"}  成功  
              {"code": 400, "message": <descripton>}  参数错误  
              {"code": 500, "message": <descripton>}  服务器错误  
```

2. 根据 `tokenId` 获取

```
url:          /get  
method:       GET
parameter:    tokenId (必填)

response:     {"code": 200, "message": "success"}  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

3. 删除

```
url:          /remove  
method:       GET
parameter:    tokenId (必填)

response:     {"code": 200, "message": "success", data: {...}}  数据存在
              {"code": 200, "message": "success"}  数据不存在
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

4. (分页)列表

```
url:          /list
method:       GET
parameter:    pageNum (页码 从1开始 选填)
              pageSize (每页条目 大于0 选填)
              
response:     {"code": 200, "message": "success", data: {total: 100, result: [{}, ...]}}  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

5. (分页)获取 `NFT Order`

```
url:          /listPasarOrder
method:       GET
parameter:    pageNum (页码 从1开始 选填 默认1)
              pageSize (每页条目 大于0 选填 默认10)
              blockNumber (返回本高度之后的数据 选填)
              endBlockNumber (返回本高度之前的数据 选填)
              orderState (订单状态： 1(OrderForSale), 2(OrderCanceled), 3(OrderFilled))
              adult （值只能是纯小写 true 或者 false 选填）
              sort (排序方式: 默认按BlockNumber降序， 传 asc表示按BlockNumber升序)
              
response:     {"code": 200, "message": "success", data: {total: 100, result: [{}, ...]}}  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

6. (可选分页)获取上架 `Orders`

````
url:          /allSaleOrders
method:       GET
parameter:    pageNum  (页码 从1开始 选填, 如果未指定则获取所有)
              pageSize (每页条目 大于0 选填， 如果未指定则获取所有)
              sortType (排序字段: 默认按订单创建时间(createTime), 可以指定为 price)
              sort     (排序方式: 默认降序， 传asc表示升序)

response:     {"code": 200, "message": "success", data: {total: 100, result: [{}, ...]}}  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
````

7. 搜索上架的 `Orders`

````
url:          /searchSaleOrders
method:       GET
parameter:    key (搜索关键字, 必选)
              searchType  (搜索类型, 值只能是 'tokenId', 'royaltyAddress', 'ownerAddress', 'name', 'description'其中之一, 可选的 )

response:     {"code": 200, "message": "success", data: [{}, ...]}  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
````


8. 获取 `Whitelist`

```
url:          /whitelist
method:       GET
parameter:    address (地址 选填 未传地址返回全部 whitelist)
              
response:     {"code": 200, "message": "success", data: [{}, ...]}  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

### Sticker API

调用URL: `https://example.com/sticker/api/v1`

1. (分页)获取 `stickers`

```
url:          /listStickers
method:       GET
parameter:    pageNum (页码 从1开始 选填 默认1)
              pageSize (每页条目 大于0 选填 默认10)
              
response:     {"code": 200, "message": "success", data: {total: 100, result: [{}, ...]}}  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

2. 搜索 `stickers`

```
url:          /search
method:       GET
parameter:    key (搜索关键字 必填 可以根据 tokenId royaltyOwner 字段进行精确匹配，或者根据 name description 进行模糊搜索)
              
response:     {"code": 200, "message": "success", data: [{}, ...]  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

3. 查询 `stickers`

```
url:          /query
method:       GET
parameter:    creator ( token 创建者 和 owner 参数必选其一)
              owner ( token 拥有者 和 creator 参数必选其一)
              
response:     {"code": 200, "message": "success", data: [{}, ...]  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```

4. 查询 `stickers` 交易历史

```
url:          /tokenTrans
method:       GET
parameter:    tokenId ( tokenID 必选)
              
response:     {"code": 200, "message": "success", data: [{}, ...]  成功
              {"code": 400, "message": <descripton>}  参数错误
              {"code": 500, "message": <descripton>}  服务器错误
```
