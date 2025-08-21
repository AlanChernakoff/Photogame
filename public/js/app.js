// app.js — funciones comunes del frontend

console.log("App.js cargado ✅");

// Helper para obtener el usuario actual
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}
