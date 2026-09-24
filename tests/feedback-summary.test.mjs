import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackServices, summarizeFeedbacks } from '../src/feedback-summary.mjs';

test('averages only valid ratings, independently of written remarks', () => {
  const [group] = summarizeFeedbacks([
    { service: 'Accueil', rating: 5, message: 'Bien' },
    { service: 'Accueil', rating: '2', message: '' },
    { service: 'Accueil', rating: null, message: 'Une remarque' },
    { service: 'Accueil', rating: 0, message: '  ' },
  ]);
  assert.equal(group.average, 3.5);
  assert.equal(group.rated, 2);
  assert.equal(group.count, 4);
  assert.equal(group.comments, 2);
});
test('general complaints have no artificial zero rating', () => {
  const [group] = summarizeFeedbacks([{ service: null, rating: null, message: 'Réclamation' }]);
  assert.equal(group.service, 'Réclamation générale');
  assert.equal(group.average, null);
});
test('legacy multi-service feedback is counted once in each named service', () => {
  const row = { service: 'Accueil, Soins, Accueil', rating: 4 };
  assert.deepEqual(feedbackServices(row), ['Accueil & Réception', 'Soins & Infirmerie']);
  assert.deepEqual(summarizeFeedbacks([row]).map(g => [g.service, g.count, g.average]), [['Accueil & Réception', 1, 4], ['Soins & Infirmerie', 1, 4]]);
  assert.deepEqual(summarizeFeedbacks([]), []);
});
test('old and current names share the same service average', () => {
  const groups = summarizeFeedbacks([{service:'Accueil', rating:5}, {service:'Accueil & Réception', rating:3}]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].average, 4);
});
test('retired services are excluded without dropping other services on historical feedback', () => {
  const groups = summarizeFeedbacks([
    { service: 'Laboratoire / Analyses, Soins', rating: 4 },
    { service: 'Pharmacie, Accueil', rating: 5 },
    { service: 'Laboratoire', rating: 1 },
    { service: 'Pharmacie', rating: 2 },
  ]);
  assert.deepEqual(groups.map(g => [g.service, g.average]), [['Accueil & Réception', 5], ['Soins & Infirmerie', 4]]);
  assert.deepEqual(feedbackServices({ service: 'Pharmacie' }), []);
  assert.deepEqual(feedbackServices({ service: 'Laboratoire / Analyses' }), []);
});
