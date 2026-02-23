/**
 * Global Dashboard Logic
 * Handles global interactions on the toolbox landing page.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Add staggered animation to tool cards
    const cards = document.querySelectorAll('.tool-card');
    cards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
    });
});
