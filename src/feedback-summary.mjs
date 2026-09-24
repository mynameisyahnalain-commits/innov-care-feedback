export function feedbackServices(feedback) {
  const aliases = { Accueil: 'Accueil & Réception', Consultation: 'Consultation médicale', Soins: 'Soins & Infirmerie' };
  const rawService = String(feedback.service || '').trim();
  if (!rawService) return ['Réclamation générale'];
  return [...new Set(rawService.split(',')
    .map(s => s.trim()).filter(Boolean)
    .map(s => aliases[s] || s)
    .filter(service => !/^(laboratoire|pharmacie)(\s|\/|$)/i.test(service)))];
}

export function summarizeFeedbacks(feedbacks) {
  const groups = new Map();
  for (const feedback of feedbacks) {
    const rating = feedback.rating == null || feedback.rating === '' ? null : Number(feedback.rating);
    const validRating = Number.isInteger(rating) && rating >= 1 && rating <= 5;
    for (const service of feedbackServices(feedback)) {
      const group = groups.get(service) || { service, count: 0, comments: 0, rated: 0, total: 0 };
      group.count++;
      if (String(feedback.message || '').trim()) group.comments++;
      if (validRating) { group.rated++; group.total += rating; }
      groups.set(service, group);
    }
  }
  return [...groups.values()].map(group => ({ ...group, average: group.rated ? group.total / group.rated : null }))
    .sort((a, b) => a.service.localeCompare(b.service, 'fr'));
}
