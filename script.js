// Notes save
const notes = document.getElementById("notes");

notes.value = localStorage.getItem("notes") || "";

notes.addEventListener("input", () => {
  localStorage.setItem("notes", notes.value);
});

// Todo
function addTodo() {
  const input = document.getElementById("todoInput");
  const list = document.getElementById("todoList");

  if (!input.value) return;

  const li = document.createElement("li");
  li.textContent = input.value;

  li.onclick = () => li.remove();

  list.appendChild(li);
  input.value = "";
}

// Links
function openLink(url) {
  window.open(url, "_blank");
}