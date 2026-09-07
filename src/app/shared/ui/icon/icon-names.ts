// Registre des icônes du design system FINA. Chaque nom ici doit avoir un
// @case correspondant dans icon.html — voir ce fichier pour les tracés.
//
// Objectif (plan-industrialisation.md, Phase 0, point 5) : remplacer
// progressivement les emojis utilisés partout dans l'appli (✕ ⚠ ✏ ✓ 💳 ...)
// par un jeu d'icônes cohérent, sans dépendre du rendu emoji du système
// d'exploitation. La liste couvre les emojis les plus utilisés aujourd'hui
// (voir le décompte dans la conversation de conception) plus les icônes de
// navigation dont Phase 1/2 auront besoin (tableau de bord, enveloppes,
// comptes...) — pas la peine d'y revenir à chaque nouvel écran.
export type IconName =
  // Remplacements directs d'emojis déjà utilisés dans le code
  | 'close' // ✕
  | 'alert' // ⚠
  | 'edit' // ✏
  | 'check' // ✓
  | 'check-circle' // ✅
  | 'card' // 💳
  | 'arrow-right' // →
  | 'arrow-left' // ←
  | 'calendar' // 📅
  | 'dot' // 🔴 🟢 (couleur pilotée par le CSS appelant, pas par l'icône)
  | 'undo' // ↩
  | 'trash' // 🗑
  | 'tag' // 🏷
  | 'flag' // 🏁
  | 'lock' // 🔒
  | 'unlock' // 🔓
  | 'money' // 💰
  | 'target' // 🎯
  | 'repeat' // 🔁
  | 'save' // 💾
  | 'chart' // 📊
  | 'trending' // 📈
  | 'settings' // ⚙
  | 'sun' // ☀
  | 'moon' // 🌙
  | 'home' // 🏠
  // Navigation (Phase 1 et écrans à venir — voir MODELE.md)
  | 'dashboard'
  | 'transactions'
  | 'envelope'
  | 'wallet'
  | 'users'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right';

// Utilisé par la vitrine /design-system pour afficher toutes les icônes
// sans avoir à maintenir une deuxième liste séparée à jour manuellement.
export const ALL_ICON_NAMES: IconName[] = [
  'close',
  'alert',
  'edit',
  'check',
  'check-circle',
  'card',
  'arrow-right',
  'arrow-left',
  'calendar',
  'dot',
  'undo',
  'trash',
  'tag',
  'flag',
  'lock',
  'unlock',
  'money',
  'target',
  'repeat',
  'save',
  'chart',
  'trending',
  'settings',
  'sun',
  'moon',
  'home',
  'dashboard',
  'transactions',
  'envelope',
  'wallet',
  'users',
  'plus',
  'chevron-left',
  'chevron-right',
];
