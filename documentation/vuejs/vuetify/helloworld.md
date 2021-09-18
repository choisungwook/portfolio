# 개요
* vuetify에서 페이지 추가

<br>

# 페이지 추가
## views/helloworld.vue 생성

```javascript
<template>
  <div>
    <h1>This is helloworld page.</h1>
  </div>
</template>

<script>
export default {
  name: "Helloworld",
};
</script>
```

## 라우터 등록
```javascript
import Vue from "vue";
import VueRouter from "vue-router";

Vue.use(VueRouter);

const routes = [
  {
    path: "/helloworld",
    name: "Hellowlrd",
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () =>
      import(/* webpackChunkName: "about" */ "../views/Helloworld.vue"),
  },
];

const router = new VueRouter({
  mode: "history",
  base: process.env.BASE_URL,
  routes,
});

export default router;
```