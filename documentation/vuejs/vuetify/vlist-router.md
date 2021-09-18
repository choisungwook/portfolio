# 개요
* v-list-item에 router 연동

<br>

# 상세내용
> 참고자료: https://vuetifyjs.com/en/api/v-list-item/#links
* to필드 이용

```javascript
<template>
  <v-app>
    <v-navigation-drawer app>
      <v-list-item>
        <v-list-item-content>
          <v-list-item-title class="text-h6"> Application </v-list-item-title>
          <v-list-item-subtitle> subtext </v-list-item-subtitle>
        </v-list-item-content>
      </v-list-item>

      <v-divider></v-divider>

      <v-list dense nav>
        <v-list-item v-for="item in items" :key="item.title" link :to="item.to">
          <v-list-item-icon>
            <v-icon>{{ item.icon }}</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script>
export default {
  name: "App",

  data() {
    return {
      items: [
        { title: "home", icon: "mdi-view-dashboard", to: "/" },
        { title: "helloworld", icon: "mdi-image", to: "/helloworld" },
      ],
      right: null,
    };
  },
};
</script>

```