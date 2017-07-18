import React from 'react';
import { Link } from 'react-router';

export default class Menu extends React.Component {
  render() {
    return (
      <nav className="menu">
        {this.props.links.map(menuLink => {
          return <Link key={menuLink.id} to={`/${menuLink.id}`} activeClassName="active">
            {menuLink.name}
          </Link>;
        })}
      </nav>
    );
  }
}
