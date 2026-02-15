import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import App from './App.vue';

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          primary: '#42a5f5',
          secondary: '#78909c',
          accent: '#66bb6a',
          error: '#ef5350',
          warning: '#ffa726',
          info: '#29b6f6',
          success: '#66bb6a',
          background: '#121212',
          surface: '#1e1e1e',
        },
      },
    },
  },
});

const app = createApp(App);
app.use(vuetify);
app.mount('#app');
