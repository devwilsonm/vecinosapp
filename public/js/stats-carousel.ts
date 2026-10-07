// @ts-nocheck
export {};

const statsCarousel = document.querySelector(".stats-grid");
const statsDots = Array.from(document.querySelectorAll(".stats-dots button"));

if (statsCarousel && statsDots.length) {
  const slides = Array.from(statsCarousel.querySelectorAll(".stat"));

  const setActiveDot = (index) => {
    statsDots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
  };

  const updateActiveDot = () => {
    const carouselLeft = statsCarousel.getBoundingClientRect().left;
    const activeIndex = slides.reduce((closest, slide, index) => {
      const distance = Math.abs(slide.getBoundingClientRect().left - carouselLeft);
      return distance < closest.distance ? { index, distance } : closest;
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
    setActiveDot(activeIndex);
  };

  statsCarousel.addEventListener("scroll", () => window.requestAnimationFrame(updateActiveDot), { passive: true });
  statsDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const slide = slides[Number(dot.dataset.slideIndex || 0)];
      slide?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    });
  });
  updateActiveDot();
}