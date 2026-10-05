export const show = (req, res) => {
  res.status(200).json({
    ...req.currentUser,
    permissions: [...req.permissions].sort()
  })
}
