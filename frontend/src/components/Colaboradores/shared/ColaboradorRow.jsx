import { Pencil, UserX } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import TierBadge from './TierBadge'
import RoleBadge from './RoleBadge'

/**
 * Row da tabela de colaboradores com botões condicionais por permissão.
 *
 * Regras de permissão (espelha backend):
 * - Botão Editar visível se admin+ OU se for o próprio registro do caller (self-edit).
 * - Botão Desativar visível se admin+ E não for self E (caller é owner OU target não é owner).
 *
 * @param colaborador - dict completo do colaborador
 * @param managerNome - nome do manager pré-resolvido (string ou null)
 * @param isAdminPlus - boolean: caller tem role admin ou owner
 * @param isOwner - boolean: caller tem role owner (permite desativar outros owners)
 * @param currentUserEmail - email do caller pra detectar self
 * @param onEdit(colaborador) - callback ao clicar editar
 * @param onDeactivate(colaborador) - callback ao clicar desativar
 */
export default function ColaboradorRow({
  colaborador,
  managerNome,
  isAdminPlus,
  isOwner,
  currentUserEmail,
  onEdit,
  onDeactivate,
}) {
  const isSelf = colaborador.email === currentUserEmail
  const canEdit = isAdminPlus || isSelf
  const targetIsOwner = colaborador.role === 'owner'
  const canDeactivate = isAdminPlus && !isSelf && (isOwner || !targetIsOwner)

  return (
    <tr className="border-b last:border-0" style={{ borderColor: 'var(--flg-border)' }}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={colaborador.nome} size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/90 truncate">{colaborador.nome}</p>
            <p className="text-[10px] text-white/40 truncate">{colaborador.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[11px] text-white/65 hidden md:table-cell">{colaborador.cargo || '—'}</td>
      <td className="px-4 py-3"><TierBadge tier={colaborador.tier} /></td>
      <td className="px-4 py-3"><RoleBadge role={colaborador.role} /></td>
      <td className="px-4 py-3 text-[11px] text-white/45 hidden lg:table-cell">{managerNome || '—'}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {canEdit && (
            <button
              onClick={() => onEdit(colaborador)}
              className="p-1.5 rounded hover:bg-white/5 text-white/55 hover:text-white/90 transition-colors cursor-pointer"
              title={isSelf && !isAdminPlus ? 'Editar meu perfil' : 'Editar'}
            >
              <Pencil size={13} />
            </button>
          )}
          {canDeactivate && (
            <button
              onClick={() => onDeactivate(colaborador)}
              className="p-1.5 rounded hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors cursor-pointer"
              title="Desativar"
            >
              <UserX size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
