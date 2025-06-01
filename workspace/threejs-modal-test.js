// Super simple test version
export function openEnvironment3D(envId, state) {
  alert("TEST: Function called!"); // This should definitely show
  console.log("TEST: openEnvironment3D called");
  console.log("TEST: Step 1 - About to show modal");
  
  const modal = document.getElementById("threejs-modal");
  if (!modal) {
    console.error("TEST: Modal not found!");
    alert("TEST: Modal not found!");
    return;
  }
  
  console.log("TEST: Step 2 - Removing hidden class");
  modal.classList.remove("hidden");
  
  console.log("TEST: Step 3 - Modal should be visible now!");
  console.log("TEST: Success!");
  
  // Also update the title to prove we're running
  document.getElementById("modal-title").textContent = "TEST VERSION WORKING!";
}

export function closeModal() {
  console.log("TEST: Closing modal");
  document.getElementById("threejs-modal").classList.add("hidden");
}